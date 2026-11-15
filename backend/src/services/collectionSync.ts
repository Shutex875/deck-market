import axios from 'axios';
import { createHash, randomUUID } from 'node:crypto';
import type { Player, PrismaClient } from '@prisma/client';
import { mapClashRoyalePlayerToAccount } from './clashRoyaleCollection';

const checkInterval = 6 * 60 * 60 * 1000;
const retryInterval = 60 * 60 * 1000;

interface CollectionPreview {
  id: string;
  revision: string;
  partial: boolean;
  levels: { card: string; from: number; to: number }[];
  evolutions: string[];
  heroes: string[];
}

export class CollectionCheckError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function collectionRevision(player: Player) {
  return createHash('sha256').update(JSON.stringify([
    player.tag, player.levels, player.evolutions, player.heroes,
  ])).digest('hex');
}

export function readCollectionPreview(player: Player) {
  const preview = player.collectionPreview
    ? JSON.parse(player.collectionPreview) as CollectionPreview
    : null;
  return preview?.revision === collectionRevision(player) ? preview : null;
}

export async function checkCollection(prisma: PrismaClient, player: Player, automatic = false) {
  const now = Date.now();
  const previousAttempt = player.collectionCheckAttemptAt?.getTime() ?? 0;
  if (player.collectionCheckStatus === 'running' && now - previousAttempt < 60_000) {
    throw new CollectionCheckError(409, 'Проверка уже запущена');
  }
  const started = new Date(Math.max(now, previousAttempt + 1));
  const claim = await prisma.player.updateMany({
    where: {
      id: player.id, tag: player.tag, collectionCheckAttemptAt: player.collectionCheckAttemptAt,
      ...(automatic && { collectionAutoCheck: true }),
    },
    data: { collectionCheckAttemptAt: started, collectionCheckStatus: 'running', collectionCheckError: null },
  });
  if (!claim.count) throw new CollectionCheckError(409, 'Проверка уже запущена. Обновите список профилей');

  try {
    return await fetchCollectionPreview(prisma, player, started);
  } catch (error) {
    const failure = collectionFailure(error);
    await prisma.player.updateMany({
      where: { id: player.id, tag: player.tag, collectionCheckAttemptAt: started },
      data: { collectionCheckStatus: 'error', collectionCheckError: failure.message },
    });
    throw failure;
  }
}

function collectionFailure(error: unknown) {
  if (error instanceof CollectionCheckError) return error;
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      return new CollectionCheckError(404, 'Игровой профиль не найден. Проверьте тег.');
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return new CollectionCheckError(502, 'API Clash Royale отклонил доступ.');
    }
    if (error.response?.status === 429) {
      return new CollectionCheckError(502, 'API Clash Royale ограничил частоту запросов.');
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new CollectionCheckError(502, 'API Clash Royale не ответил вовремя.');
    }
    return new CollectionCheckError(502, 'Не удалось получить данные из API Clash Royale.');
  }
  return new CollectionCheckError(500, 'Не удалось обработать данные коллекции.');
}

async function fetchCollectionPreview(prisma: PrismaClient, player: Player, started: Date) {
  const tag = player.tag?.trim().replace(/^#/, '').toUpperCase();
  if (!tag) throw new CollectionCheckError(400, 'Укажите тег игрового профиля');
  const token = process.env.CLASH_ROYALE_API_TOKEN;
  if (!token) throw new CollectionCheckError(503, 'Токен API Clash Royale не настроен');
  const response = await axios.get('https://api.clashroyale.com/v1/players/' + encodeURIComponent('#' + tag), {
    headers: { Authorization: 'Bearer ' + token },
    timeout: 10000,
  });
  const observed = mapClashRoyalePlayerToAccount(response.data);
  if (!observed.recognizedCards) throw new CollectionCheckError(502, 'API не вернул распознанные карты');
  const levels: Record<string, number> = JSON.parse(player.levels);
  const knownEvolutions: string[] = JSON.parse(player.evolutions);
  const knownHeroes: string[] = JSON.parse(player.heroes);
  const previous = readCollectionPreview(player);
  const observedLevels = { ...observed.levels };
  for (const { card, to } of previous?.levels ?? []) {
    observedLevels[card] = Math.max(observedLevels[card] ?? 0, to);
  }
  const levelChanges = Object.entries(observedLevels).flatMap(([card, to]) => {
    const from = levels[card] ?? (card === 'The Log' ? levels.Log : undefined) ?? 0;
    return to > from ? [{ card, from, to }] : [];
  });
  const evolutions = [...new Set([...(previous?.evolutions ?? []), ...observed.evolutions])]
    .filter(card => !knownEvolutions.includes(card));
  const heroes = [...new Set([...(previous?.heroes ?? []), ...observed.heroes])]
    .filter(card => !knownHeroes.includes(card));
  const preview = levelChanges.length || evolutions.length || heroes.length ? {
    id: previous && JSON.stringify([previous.levels, previous.evolutions, previous.heroes]) ===
      JSON.stringify([levelChanges, evolutions, heroes]) ? previous.id : randomUUID(),
    revision: collectionRevision(player), partial: !observed.usedFullCollection,
    levels: levelChanges, evolutions, heroes,
  } : null;
  const saved = await prisma.player.updateMany({
    where: {
      id: player.id, tag: player.tag, collectionCheckAttemptAt: started,
      levels: player.levels, evolutions: player.evolutions, heroes: player.heroes,
    },
    data: { collectionCheckedAt: new Date(), collectionCheckStatus: 'success', collectionPreview: preview ? JSON.stringify(preview) : null },
  });
  if (!saved.count) throw new CollectionCheckError(409, 'Профиль изменился. Проверьте обновления ещё раз');
  return preview;
}

export function startCollectionChecks(prisma: PrismaClient) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const profiles = await prisma.player.findMany({
        where: {
          ownerId: { not: null },
          collectionAutoCheck: true,
          tag: { not: null, notIn: ['', '#'] },
          AND: [
            { OR: [{ collectionCheckedAt: null }, { collectionCheckedAt: { lte: new Date(now - checkInterval) } }] },
            { OR: [{ collectionCheckAttemptAt: null }, { collectionCheckAttemptAt: { lte: new Date(now - retryInterval) } }] },
          ],
        },
        orderBy: [{ collectionCheckAttemptAt: 'asc' }, { id: 'asc' }],
        take: 30,
      });
      for (const profile of profiles) {
        if (!profile.tag?.trim()) continue;
        await checkCollection(prisma, profile, true).catch(error => {
          if (!(error instanceof CollectionCheckError)) console.error('Could not record collection check:', error);
        });
      }
    } catch (error) {
      console.error('Collection scheduler failed:', error);
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(run, 60 * 1000).unref();
}
