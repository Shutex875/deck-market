import { diagnoseUpgrades, isUpgradeTarget, MAX_UPGRADE_LEVEL } from '../services/upgradeDiagnosis';
import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userId } from './auth';
import { cardDataMap } from '../config/cards';
import { findClanWarCombinations } from '../services/clanWarCombinations';
import { calculatePlayerBonus, fixDeckTemplate } from '../services/deckService';
import { scoreFilteredDeck } from '../services/filteredRecommendations';
import { getDeckAvailability } from '../services/deckAvailability';

const cardFilterError = 'Card filters must be arrays of card IDs';
const cardFilter = z.array(z.string({ error: cardFilterError }), { error: cardFilterError }).default([]);
const requiredDeckIdsError = 'Required decks must be an array of deck IDs';
const deckTransfer = z.object({
  fromPlayer: z.string().min(1),
  toPlayer: z.string().min(1),
  mode: z.enum(['copy', 'move']),
}).refine(input => input.fromPlayer !== input.toPlayer);
const duplicateSavedDeck = 'У выбранного аккаунта уже есть такая колода';

function savedComposition(value: string): string | undefined {
  try {
    const cards: unknown = JSON.parse(value);
    if (Array.isArray(cards) && cards.length === 8 && cards.every(card => typeof card === 'string')) {
      return JSON.stringify(cards.sort());
    }
  } catch {
    // Ignore malformed legacy decks when checking duplicates.
  }
}

async function hasSavedComposition(tx: Prisma.TransactionClient, playerId: string, cards: string) {
  const composition = savedComposition(cards);
  if (!composition) return false;
  const decks = await tx.savedDeck.findMany({ where: { playerId }, select: { cards: true } });
  return decks.some(deck => savedComposition(deck.cards) === composition);
}

const recommendationRequest = z.object({
  playerName: z.string({ error: 'Player name is required' })
    .refine(name => name.trim().length > 0, 'Player name is required'),
  limit: z.union([z.number(), z.string()], { error: 'Limit must be a number or string' }).optional(),
  includeCards: cardFilter,
  excludeCards: cardFilter,
}, { error: 'Request body must be an object' });
const ordinaryRecommendationRequest = recommendationRequest.extend({
  mode: z.enum(['account', 'meta']).optional(),
});
const clanWarRequest = recommendationRequest.extend({
  mode: z.enum(['saved-first', 'best']).default('saved-first'),
  requiredDeckIds: z.array(
    z.string({ error: requiredDeckIdsError }),
    { error: requiredDeckIdsError },
  ).default([]),
});

const normalizeLimit = (value: number | string | undefined, fallback: number): number => {
  const requestedLimit = Number(value);
  return Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : fallback;
};

export const createRecommendationsRouter = (prisma: PrismaClient): Router => {
  const router = Router();

  router.post('/recommend', async (req, res) => {
    try {
      const parsed = ordinaryRecommendationRequest.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { playerName, limit: requestedLimit, includeCards, excludeCards, mode } = parsed.data;
      const limit = normalizeLimit(requestedLimit, 10);
      const ranking = mode ?? (includeCards.length || excludeCards.length ? 'meta' : 'account');
      const matchesCards = (cards: string[]) =>
        includeCards.every(card => cards.includes(card)) && !excludeCards.some(card => cards.includes(card));

      const player = await prisma.player.findUnique({ where: { ownerId_name: { ownerId: userId(res), name: playerName } } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const rawLevels = JSON.parse(player.levels);
      const evolutions = JSON.parse(player.evolutions);
      const heroes = JSON.parse(player.heroes);

      if (ranking === 'meta') {
        const catalog = await prisma.metaDeck.findMany({
          orderBy: { name: 'asc' },
          include: { category: true, source: true },
        });
        const ownedEvolutions = new Set<string>(evolutions);
        const ownedHeroes = new Set<string>(heroes);
        const matches = catalog.flatMap(deck => {
          const cards: string[] = JSON.parse(deck.cards);
          if (!matchesCards(cards)) return [];
          return [scoreFilteredDeck(deck, cards, rawLevels, ownedEvolutions, ownedHeroes)];
        });
        matches.sort((a, b) => {
          if (a.winRate === null && b.winRate !== null) return 1;
          if (a.winRate !== null && b.winRate === null) return -1;
          return b.score - a.score;
        });
        return res.json({ success: true, decks: matches.slice(0, limit), playerName, totalDecks: matches.length });
      }

      // Нормализация уровней
      const levels: Record<string, number> = {};
      Object.keys(rawLevels).forEach(key => {
        levels[key] = rawLevels[key];
      });
      if (rawLevels['The Log'] !== undefined) {
        levels['Log'] = rawLevels['The Log'];
      }

      // Фильтрация героев
      const filteredHeroes = heroes.filter((id: string) => {
        const card = cardDataMap[id];
        return card?.heroFile || card?.champion;
      });
      const metaDecks = await prisma.metaDeck.findMany({
        where: { isActive: true },
        include: { category: true, source: true },
      });

      const scoredDecks = [];

      for (const deck of metaDecks) {
        const currentCards = JSON.parse(deck.cards);
        const { cards: fixedCards, slot2Type: fixedSlot2Type } = fixDeckTemplate(currentCards, deck.slot2Type);

        // Keep normalization in memory. A recommendation read must not issue
        // one database UPDATE per deck on every request.
        const cardsArray = fixedCards;
        const { bonus, replacements, slotStatus, changedCards } = calculatePlayerBonus(
          cardsArray,
          fixedSlot2Type,
          levels,
          evolutions,
          filteredHeroes
        );
        if (!matchesCards(changedCards)) continue;

        const { cardLevels, averageLevel, missingCardsCount, rankingLevel } = getDeckAvailability(changedCards, rawLevels);
        const score = rankingLevel + bonus;

        scoredDecks.push({
          ...deck,
          cards: changedCards,
          cardLevels,
          averageLevel,
          missingCardsCount,
          score,
          bonus,
          replacements,
          slot2Type: fixedSlot2Type,
          slotStatus,
        });
      }

      const filtered = scoredDecks.filter(d => d.missingCardsCount <= 2);
      const sorted = filtered.sort((a, b) => b.score - a.score);
      const top = sorted.slice(0, limit);

      res.json({ success: true, decks: top, playerName, totalDecks: filtered.length });
    } catch (error: any) {
      console.error('❌ Ошибка в /api/recommend:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/recommend-cw', async (req, res) => {
    try {
      const parsed = clanWarRequest.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
      const { playerName, limit: requestedLimit, includeCards, excludeCards, requiredDeckIds, mode } = parsed.data;

      const limit = normalizeLimit(requestedLimit, 5);

      console.log('📥 /recommend-cw запрос:', { playerName, limit, includeCards, excludeCards, requiredDeckIds });

      const player = await prisma.player.findUnique({ where: { ownerId_name: { ownerId: userId(res), name: playerName } } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const rawLevels = JSON.parse(player.levels);
      const evolutions = JSON.parse(player.evolutions);
      const heroes = JSON.parse(player.heroes);

      // Нормализация уровней
      const levels: Record<string, number> = {};
      Object.keys(rawLevels).forEach(key => {
        levels[key] = rawLevels[key];
      });
      if (rawLevels['The Log'] !== undefined) {
        levels['Log'] = rawLevels['The Log'];
      }

      const filteredHeroes = heroes.filter((id: string) => {
        const card = cardDataMap[id];
        return card?.heroFile || card?.champion;
      });

      // 1. Загружаем сохранённые колоды игрока
      const savedDecks = await prisma.savedDeck.findMany({
        where: { playerId: player.id },
        orderBy: { createdAt: 'desc' },
      });
      console.log(`📦 Загружено сохранённых колод: ${savedDecks.length}`);

      const requiredSet = new Set(requiredDeckIds);
      const savedIds = new Set(savedDecks.map(deck => deck.id));
      if (requiredDeckIds.some(id => !savedIds.has(id))) {
        return res.json({
          success: true,
          combinations: [],
          totalCombinations: 0,
          message: 'Некоторые выбранные колоды не найдены в сохранённых',
          playerName,
        });
      }

      function scoreDeck(deck: { id: string; name: string; cards: string; slot2Type?: string | null }) {
        const { cards: fixedCards, slot2Type: fixedSlot2Type } = fixDeckTemplate(JSON.parse(deck.cards), deck.slot2Type ?? null);
        const { bonus, slotStatus, changedCards } = calculatePlayerBonus(
          fixedCards,
          fixedSlot2Type,
          levels,
          evolutions,
          filteredHeroes
        );

        const { averageLevel, missingCardsCount } = getDeckAvailability(changedCards, levels);
        const score = (averageLevel ?? 0) + bonus;

        return {
          deckId: deck.id,
          name: deck.name,
          cards: changedCards,
          averageLevel,
          bonus,
          score,
          missingCount: missingCardsCount,
          tier: undefined,
          winRate: undefined,
          slot2Type: fixedSlot2Type,
          slotStatus,
        };
      }

      const requiredCards = new Set(includeCards);
      const excluded = new Set(excludeCards.map(card => card === 'Log' ? 'The Log' : card));
      type Candidate = ReturnType<typeof scoreDeck>;
      const isReady = (deck: Candidate) => deck.cards.length === 8 && deck.missingCount === 0;
      const passesExclusions = (deck: Candidate) =>
        !deck.cards.some(card => excluded.has(card === 'Log' ? 'The Log' : card));
      const savedCandidates = savedDecks.map(scoreDeck).filter(isReady);
      const pinned = savedCandidates.filter(deck => requiredSet.has(deck.deckId));
      const readySaved = [...pinned, ...savedCandidates.filter(deck => !requiredSet.has(deck.deckId))];
      let bestCombinations = mode === 'saved-first'
        ? findClanWarCombinations(readySaved.filter(passesExclusions), requiredSet, limit, 4, requiredCards)
        : [];
      let message: string | undefined;
      let suggestions: string[] = [];
      if (!bestCombinations.length) {
        const metaDecks = await prisma.metaDeck.findMany({
          where: { isActive: true },
          select: { id: true, name: true, cards: true, slot2Type: true },
        });
        const ready = [...readySaved, ...metaDecks.filter(deck => !savedIds.has(deck.id)).map(scoreDeck).filter(isReady)];
        const eligible = ready.filter(passesExclusions);
        bestCombinations = findClanWarCombinations(eligible, requiredSet, limit, 1, requiredCards);

        if ((bestCombinations[0]?.decks.length ?? 0) < 4) {
          const missingPinned = pinned.length < requiredSet.size;
          const pinnedCards = pinned.flatMap(deck => deck.cards.map(card => card === 'Log' ? 'The Log' : card));
          if (missingPinned) message = 'В закреплённых колодах есть недостающие карты или неполный состав.';
          else if (new Set(pinnedCards).size < pinnedCards.length) message = 'Закреплённые колоды содержат одинаковые карты.';
          else if (pinned.some(deck => !passesExclusions(deck))) message = 'В закреплённой колоде есть исключённая карта.';
          else if (ready.length < 4) message = 'В пуле меньше четырёх колод со всеми доступными картами.';
          else message = 'Не удалось собрать четыре готовые колоды без пересечений с текущими условиями.';

          suggestions = [];
          const empty = new Set<string>();
          if (requiredCards.size && findClanWarCombinations(eligible, requiredSet, 1, 4).length) {
            suggestions.push('Ослабьте фильтр обязательных карт.');
          }
          if (excluded.size && findClanWarCombinations(ready, requiredSet, 1, 4, requiredCards).length) {
            suggestions.push('Ослабьте фильтр исключённых карт.');
          }
          if (requiredSet.size && findClanWarCombinations(eligible, empty, 1, 4, requiredCards).length) {
            suggestions.push('Снимите одно или несколько закреплений колод.');
          }
          if (!suggestions.length && (requiredCards.size || excluded.size || requiredSet.size) &&
              findClanWarCombinations(ready, empty, 1, 4).length) {
            suggestions.push('Попробуйте ослабить несколько условий одновременно.');
          }
          if (!suggestions.length) suggestions.push('Добавьте колоды с доступными картами и другими составами.');
        }
      }

      res.json({
        success: true,
        combinations: bestCombinations,
        totalCombinations: bestCombinations.length,
        foundSize: bestCombinations[0]?.decks.length ?? 0,
        playerName,
        message,
        suggestions,
      });
    } catch (error: any) {
      console.error('❌ Ошибка в /api/recommend-cw:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/diagnose', async (req, res) => {
    try {
      const { playerName, targetLevel = 13 } = req.body ?? {};
      if (typeof playerName !== 'string' || !playerName) return res.status(400).json({ error: 'Player name is required' });

      if (!isUpgradeTarget(targetLevel)) {
        return res.status(400).json({ error: 'Целевой уровень должен быть целым числом от 1 до ' + MAX_UPGRADE_LEVEL });
      }

      const player = await prisma.player.findUnique({ where: { ownerId_name: { ownerId: userId(res), name: playerName } } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const levels: Record<string, number> = JSON.parse(player.levels);
      const cards = Object.keys(levels).filter(card => levels[card] < targetLevel);
      const { details, totalGold } = diagnoseUpgrades(cards, levels, targetLevel);
      details.sort((a, b) => b.neededGold - a.neededGold);

      res.json({
        success: true,
        playerName,
        targetLevel,
        totalGold,
        details,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Diagnose failed' });
    }
  });

  router.get('/saved-decks', async (req, res) => {
    try {
      const { playerName } = req.query;
      if (typeof playerName !== 'string' || !playerName) return res.status(400).json({ error: 'Player name is required' });

      const player = await prisma.player.findUnique({ where: { ownerId_name: { ownerId: userId(res), name: playerName } } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const decks = await prisma.savedDeck.findMany({
        where: { playerId: player.id },
        orderBy: { createdAt: 'desc' },
      });
      res.json(decks);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch saved decks' });
    }
  });

  // Сохранить колоду
  router.post('/saved-decks', async (req, res) => {
    try {
      const { playerName, name, cards } = req.body ?? {};
      if (typeof playerName !== 'string' || !playerName || typeof name !== 'string' || !name ||
          !Array.isArray(cards) || cards.length !== 8 || !cards.every(card => typeof card === 'string')) {
        return res.status(400).json({ error: 'Invalid data' });
      }

      const player = await prisma.player.findUnique({ where: { ownerId_name: { ownerId: userId(res), name: playerName } } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const serializedCards = JSON.stringify(cards);
      const savedDeck = await prisma.$transaction(async tx => {
        if (await hasSavedComposition(tx, player.id, serializedCards)) return null;
        return tx.savedDeck.create({ data: { playerId: player.id, name, cards: serializedCards } });
      });
      if (!savedDeck) return res.status(409).json({ error: duplicateSavedDeck });
      res.json(savedDeck);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to save deck' });
    }
  });

  router.post('/saved-decks/:id/transfer', async (req, res) => {
    const parsed = deckTransfer.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Выберите другой игровой аккаунт' });
    const { fromPlayer, toPlayer, mode } = parsed.data;

    try {
      const ownerId = userId(res);
      const result = await prisma.$transaction(async tx => {
        const source = await tx.savedDeck.findFirst({
          where: { id: req.params.id, player: { name: fromPlayer, ownerId } },
        });
        const destination = await tx.player.findUnique({
          where: { ownerId_name: { name: toPlayer, ownerId } },
          select: { id: true },
        });
        if (!source || !destination) return null;
        if (await hasSavedComposition(tx, destination.id, source.cards)) return 'duplicate';
        if (mode === 'move') {
          return tx.savedDeck.update({
            where: { id: source.id, playerId: source.playerId },
            data: { playerId: destination.id },
          });
        }
        return tx.savedDeck.create({
          data: { playerId: destination.id, name: source.name, cards: source.cards },
        });
      });
      if (!result) return res.status(404).json({ error: 'Колода или игровой аккаунт не найдены' });
      if (result === 'duplicate') return res.status(409).json({ error: duplicateSavedDeck });
      res.json(result);
    } catch (error) {
      console.error('Failed to transfer saved deck:', error);
      res.status(500).json({ error: 'Не удалось сохранить колоду на другом аккаунте' });
    }
  });

  // Удалить сохранённую колоду
  router.delete('/saved-decks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { playerName } = req.query;
      if (typeof playerName !== 'string' || !playerName.trim()) {
        return res.status(400).json({ error: 'Player name is required' });
      }
      const { count } = await prisma.savedDeck.deleteMany({ where: { id, player: { name: playerName, ownerId: userId(res) } } });
      if (count === 0) return res.status(404).json({ error: 'Saved deck not found' });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete saved deck' });
    }
  });

  // === Диагностика колоды ===

  router.post('/diagnose-deck', async (req, res) => {
    try {
      const { playerName, deckId, targetLevel = MAX_UPGRADE_LEVEL } = req.body ?? {};
      if (typeof playerName !== 'string' || !playerName.trim() || typeof deckId !== 'string' || !deckId.trim()) {
        return res.status(400).json({ error: 'Player name and deckId are required' });
      }

      if (!isUpgradeTarget(targetLevel)) {
        return res.status(400).json({ error: 'Целевой уровень должен быть целым числом от 1 до ' + MAX_UPGRADE_LEVEL });
      }

      const player = await prisma.player.findUnique({ where: { ownerId_name: { ownerId: userId(res), name: playerName } } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const savedDeck = await prisma.savedDeck.findFirst({
        where: { id: deckId, playerId: player.id },
      });
      if (!savedDeck) return res.status(404).json({ error: 'Saved deck not found' });

      const cards: string[] = JSON.parse(savedDeck.cards);
      const levels: Record<string, number> = JSON.parse(player.levels);
      const { details, totalGold } = diagnoseUpgrades(cards, levels, targetLevel);

      res.json({
        success: true,
        deckName: savedDeck.name,
        totalGold,
        details,
        targetLevel,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Diagnose failed' });
    }
  });

  return router;
};
