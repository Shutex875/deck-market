import axios from 'axios';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ALL_CARDS, ALL_CARDS_DATA } from '../config/cards';
import { calculateAverageElixir } from '../config/elixirCosts';

const GEMINI_ATTEMPT_TIMEOUT_MS = 15_000;
const GEMINI_TOTAL_TIMEOUT_MS = 50_000;
const GEMINI_MAX_ATTEMPTS_PER_MODEL = 2;
const GEMINI_INITIAL_BACKOFF_MS = 500;
const GEMINI_MAX_BACKOFF_MS = 4_000;
const TOP_LADDER_CACHE_TTL_MS = 20 * 60 * 1000;

interface TopLadderImportResult {
  success: boolean;
  imported: number;
  duplicates: number;
  failedProfiles: number;
  skipped: number;
  totalPlayers: number;
  message: string;
}

let topLadderImportCache: {
  expiresAt: number;
  result: TopLadderImportResult;
} | null = null;

class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'GeminiHttpError';
  }
}

class GeminiTimeoutError extends Error {
  constructor() {
    super('Gemini request timed out');
    this.name = 'GeminiTimeoutError';
  }
}

class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiUnavailableError';
  }
}

class GeminiClientCancelledError extends Error {
  constructor() {
    super('Client cancelled the recognition request');
    this.name = 'GeminiClientCancelledError';
  }
}

const isGeminiRetryable = (error: unknown): boolean => {
  if (error instanceof GeminiTimeoutError) return true;
  if (error instanceof GeminiHttpError) {
    return [408, 429, 500, 502, 503, 504].includes(error.status);
  }
  return error instanceof TypeError ||
    (error instanceof Error && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN']
      .some(code => error.message.includes(code)));
};

const getRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

const sleepWithAbort = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new GeminiClientCancelledError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new GeminiClientCancelledError());
    };
    signal.addEventListener('abort', abort, { once: true });
  });

const callGemini = async (
  model: string,
  apiKey: string,
  prompt: string,
  mimeType: string,
  imageBase64: string,
  clientSignal: AbortSignal,
  timeoutMs: number
): Promise<string> => {
  if (clientSignal.aborted) throw new GeminiClientCancelledError();
  const attemptController = new AbortController();
  const abortAttempt = () => attemptController.abort();
  clientSignal.addEventListener('abort', abortAttempt, { once: true });
  const timeout = setTimeout(() => attemptController.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
            maxOutputTokens: 256,
          },
        }),
        signal: attemptController.signal,
      }
    );
    if (!response.ok) {
      const retryAfterMs = getRetryAfterMs(response.headers.get('retry-after'));
      const errorBody = (await response.text()).slice(0, 2_000);
      throw new GeminiHttpError(
        response.status,
        `Gemini ${model}: HTTP ${response.status}: ${errorBody}`,
        retryAfterMs
      );
    }

    const data = await response.json() as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();
    if (!text) {
      throw new Error(`Gemini ${model} returned no text`);
    }
    return text;
  } catch (error) {
    if (clientSignal.aborted) throw new GeminiClientCancelledError();
    if (attemptController.signal.aborted) throw new GeminiTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    clientSignal.removeEventListener('abort', abortAttempt);
  }
};

const recognizeWithGemini = async (
  apiKey: string,
  prompt: string,
  mimeType: string,
  imageBase64: string,
  clientSignal: AbortSignal
): Promise<{ text: string; model: string }> => {
  const configuredModels = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.5-flash-lite')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
  const models = [...new Set([
    process.env.GEMINI_VISION_MODEL?.trim(),
    ...configuredModels,
  ].filter((model): model is string => Boolean(model)))];
  const deadline = Date.now() + GEMINI_TOTAL_TIMEOUT_MS;
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL; attempt++) {
      if (clientSignal.aborted) throw new GeminiClientCancelledError();
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;

      const startedAt = Date.now();
      try {
        const text = await callGemini(
          model,
          apiKey,
          prompt,
          mimeType,
          imageBase64,
          clientSignal,
          Math.min(GEMINI_ATTEMPT_TIMEOUT_MS, remainingMs)
        );
        console.log(`Gemini Vision recognition succeeded with ${model} in ${Date.now() - startedAt}ms`);
        return { text, model };
      } catch (error) {
        if (clientSignal.aborted) throw new GeminiClientCancelledError();
        lastError = error;
        const status = error instanceof GeminiHttpError ? error.status : undefined;
        console.warn(
          `Gemini Vision model ${model} attempt ${attempt + 1}/${GEMINI_MAX_ATTEMPTS_PER_MODEL} failed` +
          `${status ? ` with HTTP ${status}` : ''}: ${error instanceof Error ? error.message.slice(0, 500) : String(error)}`
        );

        if (!isGeminiRetryable(error)) {
          if (error instanceof GeminiHttpError && [400, 404, 501].includes(error.status)) break;
          throw error;
        }

        if (attempt + 1 < GEMINI_MAX_ATTEMPTS_PER_MODEL) {
          const backoffCap = Math.min(
            GEMINI_MAX_BACKOFF_MS,
            GEMINI_INITIAL_BACKOFF_MS * 2 ** attempt
          );
          const jitterMs = Math.floor(Math.random() * (backoffCap + 1));
          const retryAfterMs = error instanceof GeminiHttpError ? error.retryAfterMs || 0 : 0;
          const delayMs = Math.max(jitterMs, retryAfterMs);
          if (delayMs < deadline - Date.now()) await sleepWithAbort(delayMs, clientSignal);
          else break;
        }
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError ?? 'No Gemini response');
  throw new GeminiUnavailableError(reason);
};

export const createMetaDecksRouter = (prisma: PrismaClient): Router => {
  const router = Router();

  router.post('/meta-decks/recognize-image', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Распознавание изображений не настроено',
        details: 'Задайте GEMINI_API_KEY в backend/.env',
      });
    }

    const image = req.body?.image;
    if (typeof image !== 'string') {
      return res.status(400).json({
        error: 'Не передано изображение',
        details: 'Ожидается поле image в формате data URL',
      });
    }

    const imageMatch = image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!imageMatch) {
      return res.status(400).json({
        error: 'Неподдерживаемый формат изображения',
        details: 'Поддерживаются PNG, JPEG и WebP',
      });
    }

    const mimeType = imageMatch[1];
    const imageBase64 = imageMatch[2].replace(/\s/g, '');
    if (Buffer.byteLength(imageBase64, 'base64') > 7 * 1024 * 1024) {
      return res.status(413).json({
        error: 'Изображение слишком большое',
        details: 'Максимальный размер скриншота — 7 МБ',
      });
    }

    const cardCatalog = ALL_CARDS_DATA.map(card => ({
      id: card.id,
      name: card.name,
      rarity: card.rarity,
      isEvolution: Boolean(card.evoFile),
      isChampion: Boolean(card.champion),
      isHero: Boolean(card.heroFile),
    }));
    const prompt = [
      'Identify the 8 Clash Royale cards visible in this deck screenshot.',
      'The screenshot uses a 2x4 grid: slots 1-4 are the top row from left to right, and slots 5-8 are the bottom row from left to right. Return exactly in that order.',
      'Carefully compare the visual details in every slot against the Clash Royale card catalog. Do not confuse small units or spells with defensive buildings.',
      'Slot 2, when it shows three small wooden units with lightning, is Zappies, not Tesla. Tesla is a single ordinary-looking defensive building.',
      'Slot 6: the green flask/vine with goblin potion is Goblin Curse, catalog id exactly "Goblin Curse", name "Проклятие гоблинов" (also called "Гоблинская лоза" or "Лоза"), and it costs 3 elixir. Do not map this flask/vine card to Suspicious Bush.',
      'Suspicious Bush is a distinct card: identify it only when its separate tall bush/vine character artwork with eyes or a mask is clearly visible; its catalog id is "Suspicious Bush" and Russian name is "Подозрительный куст". Do not use the ambiguous short name "Лоза" for Suspicious Bush.',
      'In slot 6, the Goblin Curse card costs exactly 3 elixir. Return the visible elixir cost as elixirCost for every card.',
      'For slot 6 only, map "Goblin Curse", "Goblin Vine", "Гоблинская лоза", "Лоза", "Проклятие гоблинов", "Заклятие гоблинов", and "Гоблинская спасительница" to catalog id "Goblin Curse" when cost is 3. If the visual/name classifier says "Goblin Machine" but the slot-6 card visibly has the green goblin-potion flask and cost 3, map it to Goblin Curse. Goblin Machine remains separate everywhere else.',
      'Use the card artwork, not only OCR or rarity. Distinguish evolved artwork from the base card artwork.',
      'Distinguish champions and special cards by their actual artwork. In particular, do not identify Ronin as The Log.',
      'Choose each id only from this catalog. Do not invent card IDs.',
      'Return only JSON matching {"cards":[{"id":"catalog id","name":"official card name","elixirCost":3,"isEvolution":false}]} with exactly 8 entries. elixirCost must be the numeric cost visible on the card screenshot.',
      'Evolution detection rule: if a purple diamond evolution marker is visible above a card at the top of its frame, you MUST set isEvolution: true for that card, provided the catalog marks it as evolvable. Do not lose this marker because the card art resembles its base version.',
      'A deck can have at most 2 cards with isEvolution: true. Only count cards with the visible purple diamond marker; if more than 2 appear marked, keep true for the first two marked slots in row-major order and set false for the rest.',
      'For example, an evolution marker above slot 8 (such as an evolved Executioner) means slot 8 must be marked isEvolution: true.',
      `Catalog: ${JSON.stringify(cardCatalog)}`,
    ].join('\n');

    const clientController = new AbortController();
    const abortIfDisconnected = () => {
      if (!res.writableEnded) clientController.abort();
    };
    req.on('aborted', abortIfDisconnected);
    res.on('close', abortIfDisconnected);

    try {
      const recognition = await recognizeWithGemini(
        apiKey,
        prompt,
        mimeType,
        imageBase64,
        clientController.signal
      );
      const responseText = recognition.text;
      if (!responseText) {
        return res.status(502).json({
          error: 'Vision AI не вернул список карт',
          details: 'В ответе Gemini отсутствует текст с результатом распознавания',
        });
      }

      let parsedResponse: { cards?: { id?: unknown; name?: unknown; elixirCost?: unknown; isEvolution?: unknown }[] };
      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        console.error('Gemini Vision returned invalid JSON for deck recognition');
        return res.status(502).json({
          error: 'Не удалось разобрать результат Vision AI',
          details: 'Сервис вернул ответ в неизвестном формате',
        });
      }

      if (!Array.isArray(parsedResponse.cards) || parsedResponse.cards.length !== 8) {
        return res.status(502).json({
          error: 'Vision AI не распознал ровно 8 карт',
          details: `Получено карт: ${Array.isArray(parsedResponse.cards) ? parsedResponse.cards.length : 0}`,
        });
      }

      const goblinCurse = ALL_CARDS_DATA.find(card => card.id === 'Goblin Curse');
      const goblinCurseAliases = new Set([
        'goblin curse',
        'goblin vine',
        'проклятие гоблинов',
        'заклятие гоблинов',
        'гоблинская спасительница',
        'гоблинская лоза',
        'лоза',
        'goblin machine',
      ]);
      const suspiciousBush = ALL_CARDS_DATA.find(card => card.id === 'Suspicious Bush');
      const suspiciousBushAliases = new Set([
        'suspicious bush',
        'подозрительный куст',
        'bush',
      ]);
      const recognizedCards = parsedResponse.cards.map((result, index) => {
        const identifier = typeof result.id === 'string' ? result.id : '';
        const recognizedName = typeof result.name === 'string' ? result.name : '';
        const normalizedIdentifier = identifier.trim().toLocaleLowerCase();
        const normalizedName = recognizedName.trim().toLocaleLowerCase();
        const slotSixGoblinCurseAlias = index === 5 &&
          (goblinCurseAliases.has(normalizedIdentifier) || goblinCurseAliases.has(normalizedName));
        const slotSixSuspiciousBushAlias = index === 5 &&
          (suspiciousBushAliases.has(normalizedIdentifier) || suspiciousBushAliases.has(normalizedName));
        const reportedElixirCost = typeof result.elixirCost === 'number' ? result.elixirCost : null;
        if (index === 5 && reportedElixirCost !== 3) return null;
        const card = slotSixGoblinCurseAlias
          ? goblinCurse
          : slotSixSuspiciousBushAlias
            ? suspiciousBush
            : ALL_CARDS_DATA.find(candidate =>
              candidate.id.toLocaleLowerCase() === normalizedIdentifier ||
              candidate.name.toLocaleLowerCase() === normalizedIdentifier ||
              candidate.file.toLocaleLowerCase() === normalizedIdentifier ||
              candidate.id.toLocaleLowerCase() === normalizedName ||
              candidate.name.toLocaleLowerCase() === normalizedName ||
              candidate.file.toLocaleLowerCase() === normalizedName
            );
        if (index === 5 && card?.id === 'Goblin Curse' && reportedElixirCost !== 3) return null;
        if (!card) return null;
        return {
          id: card.id,
          name: card.name,
          elixirCost: reportedElixirCost,
          isEvolution: result.isEvolution === true && Boolean(card.evoFile),
          isChampion: Boolean(card.champion),
          isHero: Boolean(card.heroFile),
        };
      });

      if (recognizedCards.some(card => card === null)) {
        return res.status(502).json({
          error: 'Vision AI вернул неизвестную карту',
          details: 'Результат содержит карту, отсутствующую в каталоге приложения',
        });
      }
      const cards = recognizedCards.filter((card): card is NonNullable<typeof card> => card !== null);
      if (new Set(cards.map(card => card.id)).size !== 8) {
        return res.status(502).json({
          error: 'Vision AI распознал повторяющиеся карты',
          details: 'Для колоды должны быть распознаны 8 разных карт',
        });
      }

      let evolutionCount = 0;
      for (const card of cards) {
        if (!card.isEvolution) continue;
        evolutionCount++;
        if (evolutionCount > 2) card.isEvolution = false;
      }

      return res.json({ cards });
    } catch (error) {
      if (clientController.signal.aborted || res.destroyed) return;
      if (error instanceof GeminiClientCancelledError) return;
      if (error instanceof GeminiUnavailableError || error instanceof GeminiTimeoutError || isGeminiRetryable(error)) {
        const details = error instanceof Error ? error.message : String(error);
        console.error(`Gemini Vision unavailable: ${details.slice(0, 500)}`);
        res.setHeader('Retry-After', '5');
        return res.status(503).json({
          error: 'Серверы Gemini временно перегружены или не отвечают. Пожалуйста, повторите попытку через пару секунд.',
          retryable: true,
        });
      }
      if (error instanceof GeminiHttpError) {
        console.error(`Gemini Vision rejected request: HTTP ${error.status}: ${error.message.slice(0, 500)}`);
        return res.status(502).json({
          error: error.status === 404
            ? 'Выбранная модель Vision API недоступна. Проверьте GEMINI_MODELS или GEMINI_VISION_MODEL в .env'
            : error.status === 400 || error.status === 403
              ? 'Vision AI отклонил запрос или API-ключ'
              : 'Не удалось распознать колоду через Vision AI',
        });
      }
      const details = error instanceof Error ? error.message : String(error);
      console.error(`Gemini Vision deck recognition failed: ${details}`);
      return res.status(500).json({
        error: 'Внутренняя ошибка при распознавании скриншота',
      });
    } finally {
      req.off('aborted', abortIfDisconnected);
      res.off('close', abortIfDisconnected);
    }
  });

  router.post('/meta-decks/import-top', async (_req, res) => {
    if (topLadderImportCache && topLadderImportCache.expiresAt > Date.now()) {
      return res.json({ ...topLadderImportCache.result, cached: true });
    }

    const token = process.env.CLASH_ROYALE_API_TOKEN;
    if (!token) {
      const details = 'CLASH_ROYALE_API_TOKEN is not set';
      console.error(`Top Ladder import cannot start: ${details}`);
      return res.status(503).json({
        error: 'Clash Royale API token is not configured',
        details,
      });
    }

    const apiClient = axios.create({
      baseURL: 'https://api.clashroyale.com/v1',
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    try {
      const rankingsEndpoint = '/locations/global/rankings/players?limit=15';
      let rankingResponse;
      try {
        rankingResponse = await apiClient.get<{
          items?: { tag: string; name: string; rank?: number }[];
        }>('/locations/global/rankings/players', { params: { limit: 15 } });
        console.log(`Clash Royale rankings request succeeded: ${rankingsEndpoint}, status ${rankingResponse.status}`);
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const details = error instanceof Error ? error.message : String(error);
        console.error(
          `Clash Royale rankings request failed: ${rankingsEndpoint}, status ${status ?? 'unavailable'}: ${details}`
        );
        if (axios.isAxiosError(error)) {
          console.log('Clash Royale rankings response body:', error.response?.data ?? '(empty response)');
        }
        return res.status(502).json({
          error: status
            ? `Ошибка API Clash Royale: статус ${status}`
            : 'Не удалось получить глобальный рейтинг Clash Royale',
          details,
        });
      }
      const rankedPlayers = rankingResponse.data.items;
      if (!Array.isArray(rankedPlayers)) {
        const details = 'Clash Royale rankings response did not contain an items array';
        console.error(details, { status: rankingResponse.status });
        console.log('Clash Royale rankings response body:', rankingResponse.data ?? '(empty response)');
        return res.status(502).json({
          error: 'Некорректный ответ глобального рейтинга Clash Royale',
          details,
        });
      }

      const playersToLoad = rankedPlayers.slice(0, 15);
      if (playersToLoad.length === 0) {
        console.error('Clash Royale rankings returned an empty player list');
        console.log('Clash Royale rankings response body:', rankingResponse.data);
      }
      const successfulProfiles: {
        player: { tag: string; name: string; rank: number };
        cards?: { name: string }[];
      }[] = [];
      const profileFailures: unknown[] = [];

      const profileBatchSize = 4;
      for (let batchStart = 0; batchStart < playersToLoad.length; batchStart += profileBatchSize) {
        const batch = playersToLoad.slice(batchStart, batchStart + profileBatchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async (player, batchIndex) => {
            const index = batchStart + batchIndex;
            const normalizedTag = `#${player.tag.replace(/^#+/, '')}`;
            const encodedTag = encodeURIComponent(normalizedTag);
            const profileEndpoint = `/players/${encodedTag}`;
            const profileResponse = await apiClient.get<{
              currentDeck?: { name: string }[];
            }>(profileEndpoint, { timeout: 9000 });
            console.log(
              `Clash Royale player profile request succeeded: ${profileEndpoint}, status ${profileResponse.status}`
            );
            if (!Array.isArray(profileResponse.data.currentDeck) || profileResponse.data.currentDeck.length === 0) {
              console.log(
                `Clash Royale profile returned no current deck for ${player.tag}:`,
                profileResponse.data ?? '(empty response)'
              );
            }
            return {
              player: { ...player, rank: player.rank || index + 1 },
              cards: profileResponse.data.currentDeck,
            };
          })
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulProfiles.push(result.value);
            return;
          }

          const error = result.reason;
          profileFailures.push(error);
          const player = batch[index];
          const status = axios.isAxiosError(error) ? error.response?.status : undefined;
          const code = axios.isAxiosError(error) ? error.code : undefined;
          const details = error instanceof Error ? error.message : String(error);
          console.error(
            `Clash Royale player profile request failed for ${player.tag}, status ${status ?? 'unavailable'}, code ${code ?? 'n/a'}: ${details}`
          );
          if (axios.isAxiosError(error)) {
            console.log(
              `Clash Royale profile response body for ${player.tag}:`,
              error.response?.data ?? '(empty response)'
            );
          }
        });

        if (batchStart + profileBatchSize < playersToLoad.length) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      const failedProfiles = profileFailures.length;
      console.log(
        `Top Ladder profile fetch summary: requested=${playersToLoad.length}, succeeded=${successfulProfiles.length}, failed=${failedProfiles}`
      );
      if (successfulProfiles.length === 0) {
        const error = profileFailures[0];
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const details = axios.isAxiosError(error) && error.code === 'ECONNABORTED'
          ? `Превышен тайм-аут запроса профиля (${apiClient.defaults.timeout} мс)`
          : status === 401 || status === 403
            ? `Ошибка авторизации API (${status})`
            : status
              ? `Ошибка API Clash Royale: статус ${status}`
              : error instanceof Error
                ? error.message
                : String(error ?? 'Профиль игрока не вернул ответ');
        console.error('All Clash Royale top player profile requests failed:', details);
        return res.json({
          success: true,
          imported: 0,
          duplicates: 0,
          failedProfiles,
          skipped: 0,
          totalPlayers: rankedPlayers.length,
          message: `Не удалось загрузить профили игроков для импорта (${details}).`,
          details,
        });
      }

      const normalizeCardName = (name: string) => name.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
      const cardIdByApiName = new Map<string, string>();
      for (const card of ALL_CARDS_DATA) {
        for (const alias of [card.id, card.file]) {
          cardIdByApiName.set(normalizeCardName(alias), card.id);
        }
      }
      for (const [apiName, cardId] of Object.entries({
        skeletons: 'Skeleton',
        'minion horde': 'Horde',
        'royal delivery': 'RoyalDelivery',
      })) {
        cardIdByApiName.set(normalizeCardName(apiName), cardId);
      }

      let decksWithParsedComposition = 0;
      const importableDecks = successfulProfiles.flatMap(({ player, cards }) => {
        const rejectDeck = (reason: string) => {
          console.error(`Top Ladder deck rejected for ${player.tag} (${player.name}): ${reason}`);
          return [];
        };
        if (!Array.isArray(cards) || cards.length === 0) return rejectDeck('Пустой массив карт');
        if (cards.length !== 8) return rejectDeck(`Ожидалось 8 карт, получено ${cards.length}`);
        const cardNames = cards.map(card => typeof card?.name === 'string' ? card.name.trim() : '');
        if (cardNames.some(cardName => !cardName)) return rejectDeck('В ответе есть карта без названия');

        const cardIds = cardNames.map(cardName => cardIdByApiName.get(normalizeCardName(cardName)));
        const missingCardNames = cardNames.filter((_, index) => !cardIds[index]);
        if (missingCardNames.length > 0) {
          return rejectDeck(`Не найдены карты в каталоге: ${missingCardNames.join(', ')}`);
        }
        const canonicalCardIds = cardIds.filter((cardId): cardId is string => cardId !== undefined);
        if (new Set(canonicalCardIds).size !== 8) {
          return rejectDeck(`Дубликат ID карты после маппинга: ${canonicalCardIds.join(', ')}`);
        }
        decksWithParsedComposition++;
        return [{
          player,
          cards: canonicalCardIds,
          compositionKey: JSON.stringify([...canonicalCardIds].sort()),
        }];
      });
      console.log(
        `Top Ladder deck parsing summary: profiles=${successfulProfiles.length}, parsedCompositions=${decksWithParsedComposition}, importable=${importableDecks.length}, rejected=${successfulProfiles.length - importableDecks.length}`
      );

      const existingDecks = await prisma.metaDeck.findMany({ select: { cards: true } });
      const knownCompositions = new Set<string>();
      for (const deck of existingDecks) {
        try {
          const cards: unknown = JSON.parse(deck.cards);
          if (Array.isArray(cards) && cards.length === 8 && cards.every(card => typeof card === 'string')) {
            knownCompositions.add(JSON.stringify([...cards].sort()));
          }
          console.log(`Top Ladder duplicate check loaded ${knownCompositions.size} existing 8-card compositions`);
        } catch (error) {
          console.error('Skipping malformed stored meta deck card list during duplicate check:', error);
        }
      }

      const category = await prisma.category.upsert({
        where: { name: 'Top Ladder' },
        update: {},
        create: { name: 'Top Ladder' },
      });
      const source = await prisma.source.upsert({
        where: { name: 'Auto-Import' },
        update: {},
        create: { name: 'Auto-Import' },
      });

      const importedAt = new Date().toLocaleDateString('ru-RU');
      let imported = 0;
      let duplicates = 0;
      for (const deck of importableDecks) {
        if (knownCompositions.has(deck.compositionKey)) {
          console.log(
            `Top Ladder deck skipped as duplicate for ${deck.player.tag}: ${deck.cards.join(', ')}`
          );
          duplicates++;
          continue;
        }

        const rank = deck.player.rank;
        const safePlayerName = deck.player.name.replace(/[<>]/g, '').slice(0, 60);
        const compositionSuffix = createHash('sha1').update(deck.compositionKey).digest('hex').slice(0, 8);
        const name = `Top #${rank} - ${safePlayerName} (${compositionSuffix})`;
        const avgElixir = calculateAverageElixir(deck.cards);
        await prisma.metaDeck.create({
          data: {
            name,
            cards: JSON.stringify(deck.cards),
            avgElixir,
            description: `Импортировано из Топ-15 (${safePlayerName}, #${rank} Global) — ${importedAt}`,
            tier: 'Top Ladder',
            categoryId: category.id,
            sourceId: source.id,
            externalId: `top-ladder:${deck.player.tag}`,
            isActive: true,
          },
        });
        knownCompositions.add(deck.compositionKey);
        imported++;
      }

      const decksWithoutEightCards = successfulProfiles.length - importableDecks.length;
      const result: TopLadderImportResult = {
        success: true,
        imported,
        duplicates,
        failedProfiles,
        skipped: duplicates + decksWithoutEightCards,
        totalPlayers: rankedPlayers.length,
        message: `Добавлено колод: ${imported}; дубликатов пропущено: ${duplicates}.`,
      };
      if (failedProfiles === 0 && importableDecks.length > 0) {
        topLadderImportCache = {
          expiresAt: Date.now() + TOP_LADDER_CACHE_TTL_MS,
          result,
        };
      }
      res.json(result);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        console.error(
          `Top Ladder import API request failed: status ${status ?? 'unavailable'}: ${error.message}`
        );
        return res.status(502).json({
          error: status
            ? `Ошибка API Clash Royale: статус ${status}`
            : 'Не удалось связаться с API Clash Royale',
          details: error.message,
        });
      } else {
        console.error('Top Ladder import failed:', error);
      }
      const details = error instanceof Error ? error.message : String(error);
      res.status(502).json({
        error: 'Не удалось импортировать колоды из глобального рейтинга Clash Royale',
        details,
      });
    }
  });

  router.get('/meta-decks', async (req, res) => {
    try {
      const requestedSortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'name';
      const requestedOrder = typeof req.query.order === 'string' ? req.query.order : 'asc';
      const sortBy = ['name', 'createdAt', 'avgElixir'].includes(requestedSortBy)
        ? requestedSortBy
        : 'name';
      const order = requestedOrder === 'desc' ? 'desc' : 'asc';
      const decks = await prisma.metaDeck.findMany({
        orderBy: { [sortBy]: order },
        include: { category: true, source: true }
      });
      const hasLegacyDecks = decks.some(deck => deck.avgElixir === null);
      const decksWithElixir: typeof decks = [];
      for (const deck of decks) {
        if (deck.avgElixir !== null) {
          decksWithElixir.push(deck);
          continue;
        }
        try {
          const avgElixir = calculateAverageElixir(JSON.parse(deck.cards));
          await prisma.metaDeck.update({
            where: { id: deck.id },
            data: { avgElixir },
          });
          decksWithElixir.push({ ...deck, avgElixir });
        } catch (error) {
          console.error(`Could not backfill average elixir for meta deck ${deck.id}:`, error);
          decksWithElixir.push(deck);
        }
      }
      if (sortBy === 'avgElixir' && hasLegacyDecks) {
        const backfilledAndSortedDecks = await prisma.metaDeck.findMany({
          orderBy: { avgElixir: order },
          include: { category: true, source: true },
        });
        return res.json(backfilledAndSortedDecks);
      }
      res.json(decksWithElixir);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch meta decks' });
    }
  });
  
  router.delete('/meta-decks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.metaDeck.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete meta deck' });
    }
  });
  // Получить одну мета-колоду
  router.get('/meta-decks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deck = await prisma.metaDeck.findUnique({
        where: { id },
        include: { category: true, source: true }
      });
      if (!deck) return res.status(404).json({ error: 'Deck not found' });
      res.json(deck);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch deck' });
    }
  });
  
  // Обновить мета-колоду
  router.put('/meta-decks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, cards, description, slot2Type, tier, winRate, categoryId, sourceId, sourceUrl } = req.body;
      if (!name || !cards || !Array.isArray(cards) || cards.length !== 8) {
        return res.status(400).json({ error: 'Name and exactly 8 cards are required' });
      }
      let avgElixir: number;
      try {
        avgElixir = calculateAverageElixir(cards);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid card list' });
      }
      if (!categoryId || !sourceId) {
        return res.status(400).json({ error: 'categoryId and sourceId are required' });
      }
      const updated = await prisma.metaDeck.update({
        where: { id },
        data: {
          name,
          cards: JSON.stringify(cards),
          ...(description !== undefined && { description: description || null }),
          slot2Type: slot2Type || null,
          tier: tier || null,
          winRate: winRate ? parseFloat(winRate) : null,
          avgElixir,
          categoryId,
          sourceId,
          sourceUrl: sourceUrl || null,
        }
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update deck' });
    }
  });

  router.post('/meta-decks/import-deckshop', async (req, res) => {
    // ... (оставлен как в исходном файле, без изменений)
    try {
      const { category = 'general' } = req.body;
  
      const deckshopSource = await prisma.source.upsert({
        where: { name: 'deckshop' },
        update: {},
        create: { name: 'deckshop' },
      });
      const categoryRecord = await prisma.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });
  
      const urlsToTry = [
        'https://www.deckshop.pro/ru/decks/popular',
        'https://www.deckshop.pro/ru/decks',
        'https://www.deckshop.pro/ru/deck-list',
        'https://www.deckshop.pro/ru/',
        'https://www.deckshop.pro/ru/best-decks/',
      ];
  
      let html = '';
      let successUrl = '';
      for (const url of urlsToTry) {
        try {
          const response = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000,
          });
          if (response.status === 200) {
            html = response.data;
            successUrl = url;
            break;
          }
        } catch (e) { }
      }
  
      if (!html) {
        return res.status(404).json({
          error: 'Не удалось получить данные с deckshop.pro. Возможно, сайт временно недоступен или изменил структуру.',
          suggestion: 'Пожалуйста, добавьте колоды вручную через форму "Добавить мета-колоду".'
        });
      }
  
      const $ = cheerio.load(html);
      const decks: { name: string; cards: string[]; tier?: string; winRate?: number }[] = [];
  
      const possibleSelectors = [
        '.deck-list-item',
        '.deck-item',
        '.deck-card',
        '.deck',
        '[data-testid="deck"]',
        '.col-lg-4 .card',
        '.deck-preview',
        '.deck-card-container',
      ];
  
      for (const selector of possibleSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          elements.each((i, el) => {
            const name = $(el).find('.deck-name, .title, h4, h5').first().text().trim() || `Колода ${i+1}`;
            const cards: string[] = [];
            $(el).find('.card-name, .card, .deck-card, .card-img-alt, img[alt]').each((j, cardEl) => {
              let cardName = $(cardEl).text().trim() || $(cardEl).attr('alt') || '';
              cardName = cardName.replace(/[^a-zA-Z ]/g, '').trim();
              if (cardName && ALL_CARDS.includes(cardName)) {
                cards.push(cardName);
              }
            });
            if (cards.length === 8) {
              const tier = $(el).find('.tier, .deck-tier, .badge').first().text().trim() || null;
              const winRateText = $(el).find('.win-rate, .winrate, .percentage').first().text().trim();
              const winRate = winRateText ? parseFloat(winRateText) : null;
              decks.push({ name, cards, tier: tier || undefined, winRate: winRate || undefined });
            }
          });
          if (decks.length > 0) break;
        }
      }
  
      if (decks.length === 0) {
        return res.status(404).json({
          error: 'Не удалось найти колоды на странице. Структура сайта изменилась.',
          suggestion: 'Вы можете добавить колоды вручную через форму "Добавить мета-колоду".'
        });
      }
  
      let imported = 0;
      for (const deck of decks) {
        const existing = await prisma.metaDeck.findUnique({ where: { name: deck.name } });
        if (!existing) {
          await prisma.metaDeck.create({
            data: {
              name: deck.name,
              cards: JSON.stringify(deck.cards),
              avgElixir: calculateAverageElixir(deck.cards),
              tier: deck.tier || null,
              winRate: deck.winRate || null,
              sourceId: deckshopSource.id,
              categoryId: categoryRecord.id,
              sourceUrl: successUrl,
              isActive: true,
            }
          });
          imported++;
        }
      }
  
      res.json({
        success: true,
        imported,
        total: decks.length,
        message: `Импортировано ${imported} колод из ${decks.length} найденных.`
      });
    } catch (error: any) {
      console.error('Import error:', error.message);
      res.status(500).json({
        error: 'Ошибка при импорте: ' + error.message,
        suggestion: 'Попробуйте добавить колоды вручную через форму "Добавить мета-колоду".'
      });
    }
  });
  
  router.post('/meta-decks', async (req, res) => {
    try {
      const { name, cards, description, slot2Type, tier, winRate, categoryId, sourceId, sourceUrl, externalId } = req.body;
      if (!name || !cards || !Array.isArray(cards) || cards.length !== 8) {
        return res.status(400).json({ error: 'Name and exactly 8 cards are required' });
      }
      let avgElixir: number;
      try {
        avgElixir = calculateAverageElixir(cards);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid card list' });
      }
      if (!categoryId || !sourceId) {
        return res.status(400).json({ error: 'categoryId and sourceId are required' });
      }
      const newDeck = await prisma.metaDeck.create({
        data: {
          name,
          cards: JSON.stringify(cards),
          description: description || null,
          slot2Type: slot2Type || null,
          tier: tier || null,
          winRate: winRate ? parseFloat(winRate) : null,
          avgElixir,
          categoryId,
          sourceId,
          sourceUrl: sourceUrl || null,
          externalId: externalId || null,
          isActive: true,
        }
      });
      res.json(newDeck);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create meta deck' });
    }
  });
  
  router.post('/meta-decks/import-mock', async (req, res) => {
    try {
      const mockSource = await prisma.source.upsert({
        where: { name: 'Curated Meta' },
        update: {},
        create: { name: 'Curated Meta' },
      });
      const generalCategory = await prisma.category.upsert({
        where: { name: 'general' },
        update: {},
        create: { name: 'general' },
      });
  
      const mockDecks = [
        { name: 'Evo Royal Giant Fisherman', cards: ['Fisherman', 'Hunter', 'Royal Giant', 'Phoenix', 'Lightning', 'Skeleton', 'Electro Spirit', 'The Log'], slot2Type: 'evo', tier: 'S', winRate: 54.2 },
        { name: 'Goblinstein Drill Control', cards: ['Goblinstein', 'Goblin Drill', 'Knight', 'Dart Goblin', 'Poison', 'The Log', 'Bats', 'Tesla'], slot2Type: 'evo', tier: 'S', winRate: 53.8 },
        { name: 'Evo Mortar Miner Cycle', cards: ['Miner', 'Archers', 'Mortar', 'Knight', 'Skeleton', 'Fireball', 'Bats', 'The Log'], slot2Type: 'evo', tier: 'A', winRate: 52.9 },
        { name: 'LavaLoon Evo Barbarians', cards: ['Lava Hound', 'Balloon', 'Barbarians', 'Inferno Dragon', 'Guards', 'Arrows', 'Tombstone', 'Fireball'], slot2Type: 'evo', tier: 'A', winRate: 52.7 },
        { name: 'P.E.K.K.A Bridge Spam', cards: ['Battle Ram', 'Bandit', 'PEKKA', 'Royal Ghost', 'Magic Archer', 'Electro Wizard', 'Poison', 'Zap'], slot2Type: 'evo', tier: 'A', winRate: 52.4 },
        { name: 'Boss Bandit Bridge Spam', cards: ['Battle Ram', 'Boss Bandit', 'Barbarians', 'Bandit', 'Royal Ghost', 'Magic Archer', 'Zap', 'Fireball'], slot2Type: 'evo', tier: 'S', winRate: 53.6 },
        { name: 'Goblin Giant Sparky Beatdown', cards: ['Goblin Giant', 'Sparky', 'Golden Knight', 'Bats', 'Rage', 'Zap', 'Dark Prince', 'Mega Minion'], slot2Type: null, tier: 'A', winRate: 52.2 },
        { name: 'Archer Queen Hog Earthquake', cards: ['Hog Rider', 'Earthquake', 'Archers', 'Valkyrie', 'Archer Queen', 'Cannon', 'Skeleton', 'Fire Spirit'], slot2Type: 'evo', tier: 'A', winRate: 52.6 },
        { name: 'Skeleton King Graveyard Control', cards: ['Graveyard', 'Poison', 'Skeleton King', 'Baby Dragon', 'Ice Wizard', 'Tombstone', 'Barbarian Barrel', 'Knight'], slot2Type: null, tier: 'A', winRate: 52.1 },
        { name: 'Little Prince Log Bait', cards: ['Goblin Barrel', 'Princess', 'Little Prince', 'Goblin Gang', 'Knight', 'Inferno Tower', 'Rocket', 'The Log'], slot2Type: null, tier: 'A', winRate: 51.9 },
        { name: 'Monk Phoenix Control', cards: ['Monk', 'Phoenix', 'Goblinstein', 'Tornado', 'Baby Dragon', 'Barbarian Barrel', 'Poison', 'Tombstone'], slot2Type: null, tier: 'A', winRate: 52.3 },
        { name: 'Evo Mega Knight Ram Rider', cards: ['Ram Rider', 'Fireball', 'Mega Knight', 'Bandit', 'Electro Wizard', 'Bats', 'Zap', 'Goblinstein'], slot2Type: 'evo', tier: 'A', winRate: 52.0 },
      ];

      let imported = 0;
      let skipped = 0;
      for (const deck of mockDecks) {
        const existing = await prisma.metaDeck.findUnique({ where: { name: deck.name } });
        if (!existing) {
          await prisma.metaDeck.create({
            data: {
              name: deck.name,
              cards: JSON.stringify(deck.cards),
              avgElixir: calculateAverageElixir(deck.cards),
              slot2Type: deck.slot2Type || null,
              tier: deck.tier || null,
              winRate: deck.winRate || null,
              sourceId: mockSource.id,
              categoryId: generalCategory.id,
              isActive: true,
            }
          });
          imported++;
        } else {
          skipped++;
        }
      }
      res.json({
        success: true,
        imported,
        skipped,
        message: `Добавлено мета-колод: ${imported}; уже были в каталоге: ${skipped}.`,
      });
    } catch (error: any) {
      console.error('Curated meta deck import error:', error);
      res.status(500).json({ error: 'Ошибка импорта мета-колод' });
    }
  });
  
  // === Categories & Sources CRUD ===
  router.get('/categories', async (req, res) => {
    try {
      const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
      res.json(categories);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });
  
  router.post('/categories', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const category = await prisma.category.create({ data: { name } });
      res.json(category);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create category' });
    }
  });
  
  router.delete('/categories/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const decks = await prisma.metaDeck.count({ where: { categoryId: id } });
      if (decks > 0) {
        return res.status(400).json({ error: 'Cannot delete category with existing decks' });
      }
      await prisma.category.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  });
  
  router.get('/sources', async (req, res) => {
    try {
      const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } });
      res.json(sources);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch sources' });
    }
  });
  
  router.post('/sources', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const source = await prisma.source.create({ data: { name } });
      res.json(source);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create source' });
    }
  });
  
  router.delete('/sources/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const decks = await prisma.metaDeck.count({ where: { sourceId: id } });
      if (decks > 0) {
        return res.status(400).json({ error: 'Cannot delete source with existing decks' });
      }
      await prisma.source.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete source' });
    }
  });
  // === Сохранённые колоды ===
  
  // Получить все сохранённые колоды для игрока

  return router;
};
