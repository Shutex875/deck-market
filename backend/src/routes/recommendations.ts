import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { cardDataMap } from '../config/cards';
import { calculatePlayerBonus, fixDeckTemplate } from '../services/deckService';

export const createRecommendationsRouter = (prisma: PrismaClient): Router => {
  const router = Router();

  router.post('/recommend', async (req, res) => {
    try {
      const { playerName } = req.body;
      if (!playerName) return res.status(400).json({ error: 'Player name is required' });

      const player = await prisma.player.findUnique({ where: { name: playerName } });
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

        if (JSON.stringify(fixedCards) !== JSON.stringify(currentCards) || fixedSlot2Type !== deck.slot2Type) {
          await prisma.metaDeck.update({
            where: { id: deck.id },
            data: {
              cards: JSON.stringify(fixedCards),
              slot2Type: fixedSlot2Type,
            },
          });
          deck.cards = JSON.stringify(fixedCards);
          deck.slot2Type = fixedSlot2Type;
        }

        const cardsArray = JSON.parse(deck.cards);
        const { bonus, replacements, slotStatus, changedCards } = calculatePlayerBonus(
          cardsArray,
          deck.slot2Type,
          levels,
          evolutions,
          filteredHeroes
        );

        // Расчёт среднего уровня по changedCards
        let totalLevel = 0;
        let missingCount = 0;
        const cardLevels: Record<string, number> = {};
        changedCards.forEach((cardId: string) => {
          const level = levels[cardId] || 1;
          cardLevels[cardId] = level;
          totalLevel += level;
          if (level === 1 && !levels[cardId]) missingCount++;
        });
        const averageLevel = totalLevel / changedCards.length;
        const score = averageLevel + bonus;

        scoredDecks.push({
          ...deck,
          cards: changedCards,
          cardLevels,
          averageLevel,
          missingCardsCount: missingCount,
          score,
          bonus,
          replacements,
          slot2Type: deck.slot2Type,
          slotStatus,
        });
      }

      const filtered = scoredDecks.filter(d => d.missingCardsCount <= 2);
      const sorted = filtered.sort((a, b) => b.score - a.score);
      const top = sorted.slice(0, 10);

      res.json({ success: true, decks: top, playerName });
    } catch (error: any) {
      console.error('❌ Ошибка в /api/recommend:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  router.post('/recommend-cw', async (req, res) => {
    try {
      const {
        playerName,
        limit = 5,
        includeCards = [],
        excludeCards = [],
        requiredDeckIds = []
      } = req.body;

      console.log('📥 /recommend-cw запрос:', { playerName, limit, includeCards, excludeCards, requiredDeckIds });

      if (!playerName) return res.status(400).json({ error: 'Player name is required' });

      const player = await prisma.player.findUnique({ where: { name: playerName } });
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

      // 2. Формируем пул колод для оценки
      let decksToScore: { id: string; name: string; cards: string[]; slot2Type: string | null }[] = [];

      // Если есть обязательные колоды, добавляем их первыми
      if (requiredDeckIds && requiredDeckIds.length > 0) {
        const requiredSaved = savedDecks.filter(d => requiredDeckIds.includes(d.id));
        if (requiredSaved.length !== requiredDeckIds.length) {
          return res.json({
            success: true,
            combinations: [],
            totalCombinations: 0,
            message: 'Некоторые выбранные колоды не найдены в сохранённых',
            playerName,
          });
        }
        requiredSaved.forEach(d => {
          decksToScore.push({
            id: d.id,
            name: d.name,
            cards: JSON.parse(d.cards),
            slot2Type: null,
          });
        });
      }

      // Добавляем остальные сохранённые колоды
      const savedIds = new Set(decksToScore.map(d => d.id));
      const otherSaved = savedDecks.filter(d => !savedIds.has(d.id));
      otherSaved.forEach(d => {
        decksToScore.push({
          id: d.id,
          name: d.name,
          cards: JSON.parse(d.cards),
          slot2Type: null,
        });
      });

      // Если сохранённых колод меньше 4, добавляем мета-колоды
      if (decksToScore.length < 4) {
        const metaDecks = await prisma.metaDeck.findMany({
          where: { isActive: true },
          include: { category: true, source: true },
        });
        console.log(`📚 Добавлено мета-колод: ${metaDecks.length}`);
        metaDecks.forEach(md => {
          if (!decksToScore.some(d => d.id === md.id)) {
            decksToScore.push({
              id: md.id,
              name: md.name,
              cards: JSON.parse(md.cards),
              slot2Type: md.slot2Type || null,
            });
          }
        });
      }

      console.log(`🃏 Всего колод для оценки: ${decksToScore.length}`);

      // 3. Вычисляем score для каждой колоды
      const scoredDecks = [];
      for (const deck of decksToScore) {
        const { cards: fixedCards, slot2Type: fixedSlot2Type } = fixDeckTemplate(deck.cards, deck.slot2Type);
        const { bonus, slotStatus, changedCards } = calculatePlayerBonus(
          fixedCards,
          fixedSlot2Type,
          levels,
          evolutions,
          filteredHeroes
        );

        let totalLevel = 0;
        let missingCount = 0;
        changedCards.forEach((cardId: string) => {
          const level = levels[cardId] || 1;
          totalLevel += level;
          if (level === 1 && !levels[cardId]) missingCount++;
        });
        const averageLevel = totalLevel / changedCards.length;
        const score = averageLevel + bonus;

        scoredDecks.push({
          deckId: deck.id,
          name: deck.name,
          cards: changedCards,
          averageLevel,
          bonus,
          score,
          missingCount,
          tier: undefined,
          winRate: undefined,
          slot2Type: fixedSlot2Type,
          slotStatus,
        });
      }

      // 4. Применяем фильтры по картам
      let filteredDecks = scoredDecks;
      if (includeCards && includeCards.length > 0) {
        const before = filteredDecks.length;
        filteredDecks = filteredDecks.filter(deck =>
          includeCards.every((cardId: string) => deck.cards.includes(cardId))
        );
        console.log(`🔍 Фильтр includeCards (${includeCards.length}): ${before} → ${filteredDecks.length}`);
      }
      if (excludeCards && excludeCards.length > 0) {
        const before = filteredDecks.length;
        filteredDecks = filteredDecks.filter(deck =>
          !excludeCards.some((cardId: string) => deck.cards.includes(cardId))
        );
        console.log(`🔍 Фильтр excludeCards (${excludeCards.length}): ${before} → ${filteredDecks.length}`);
      }

      // 5. Оставляем только колоды с пропущенными картами <= 2
      const validDecks = filteredDecks.filter(d => d.missingCount <= 2);
      console.log(`✅ Колод с missingCount <= 2: ${validDecks.length} (из ${filteredDecks.length})`);

      if (validDecks.length < 2) {
        return res.json({
          success: true,
          combinations: [],
          totalCombinations: 0,
          message: `Недостаточно колод (${validDecks.length}) для составления связки. Зарегистрируйте новые колоды или улучшите карты!`,
          playerName,
        });
      }

      // 6. Проверяем обязательные колоды
      const requiredSet = new Set(requiredDeckIds || []);
      if (requiredSet.size > 0) {
        const foundRequired = validDecks.filter(d => requiredSet.has(d.deckId));
        if (foundRequired.length !== requiredSet.size) {
          return res.json({
            success: true,
            combinations: [],
            totalCombinations: 0,
            message: 'Некоторые обязательные колоды не прошли фильтрацию по картам или имеют слишком много пропусков',
            playerName,
          });
        }
      }

      // 7. Генерация комбинаций
      const hasOverlap = (deckList: typeof validDecks): boolean => {
        const usedCards = new Set<string>();
        for (const deck of deckList) {
          for (const card of deck.cards) {
            if (usedCards.has(card)) return true;
            usedCards.add(card);
          }
        }
        return false;
      };

      const getCombinations = (arr: any[], k: number): any[][] => {
        if (k === 0) return [[]];
        if (arr.length === 0) return [];
        const result: any[][] = [];
        const [first, ...rest] = arr;
        const withFirst = getCombinations(rest, k - 1).map(comb => [first, ...comb]);
        const withoutFirst = getCombinations(rest, k);
        return [...withFirst, ...withoutFirst];
      };

      let bestCombinations: { decks: typeof validDecks; totalScore: number; avgScore: number }[] = [];
      let foundSize = 0;

      const maxSize = 4;
      const minSize = 2;

      for (let size = maxSize; size >= minSize; size--) {
        const combos = getCombinations(validDecks, size);
        let validCombos = combos.filter(combo => !hasOverlap(combo));
        if (requiredSet.size > 0) {
          validCombos = validCombos.filter(combo => {
            const deckIds = combo.map(d => d.deckId);
            return Array.from(requiredSet).every(id => deckIds.includes(id));
          });
        }
        if (validCombos.length > 0) {
          const sorted = validCombos.map(combo => {
            const totalScore = combo.reduce((sum, d) => sum + d.score, 0);
            const avgScore = totalScore / combo.length;
            return { decks: combo, totalScore, avgScore };
          }).sort((a, b) => b.totalScore - a.totalScore);
          bestCombinations = sorted.slice(0, limit);
          foundSize = size;
          break;
        }
      }

      if (bestCombinations.length === 0) {
        return res.json({
          success: true,
          combinations: [],
          totalCombinations: 0,
          message: 'Не найдено связок без пересечений. Попробуйте изменить фильтры или добавьте больше колод!',
          playerName,
        });
      }

      res.json({
        success: true,
        combinations: bestCombinations,
        totalCombinations: bestCombinations.length,
        foundSize,
        playerName,
        message: undefined,
      });
    } catch (error: any) {
      console.error('❌ Ошибка в /api/recommend-cw:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  router.post('/diagnose', async (req, res) => {
    try {
      const { playerName, targetLevel = 13 } = req.body;
      if (!playerName) return res.status(400).json({ error: 'Player name is required' });

      const player = await prisma.player.findUnique({ where: { name: playerName } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const levels = JSON.parse(player.levels);
      const upgradeCosts: Record<number, number> = {
        1: 0, 2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1000, 8: 2000,
        9: 4000, 10: 8000, 11: 20000, 12: 50000, 13: 100000
      };

      const diagnosis: { card: string; currentLevel: number; neededGold: number }[] = [];
      let totalGold = 0;

      Object.keys(levels).forEach(card => {
        const current = levels[card] || 1;
        if (current < targetLevel) {
          let cost = 0;
          for (let lv = current; lv < targetLevel; lv++) {
            cost += upgradeCosts[lv] || 0;
          }
          totalGold += cost;
          diagnosis.push({ card, currentLevel: current, neededGold: cost });
        }
      });

      diagnosis.sort((a, b) => b.neededGold - a.neededGold);

      res.json({
        success: true,
        playerName,
        targetLevel,
        totalGold,
        details: diagnosis,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Diagnose failed' });
    }
  });

  router.get('/saved-decks', async (req, res) => {
    try {
      const { playerName } = req.query;
      if (!playerName) return res.status(400).json({ error: 'Player name is required' });

      const player = await prisma.player.findUnique({ where: { name: String(playerName) } });
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
      const { playerName, name, cards } = req.body;
      if (!playerName || !name || !cards || !Array.isArray(cards) || cards.length !== 8) {
        return res.status(400).json({ error: 'Invalid data' });
      }

      const player = await prisma.player.findUnique({ where: { name: playerName } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const savedDeck = await prisma.savedDeck.create({
        data: {
          playerId: player.id,
          name,
          cards: JSON.stringify(cards),
        },
      });
      res.json(savedDeck);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to save deck' });
    }
  });

  // Удалить сохранённую колоду
  router.delete('/saved-decks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.savedDeck.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete saved deck' });
    }
  });

  // === Диагностика колоды ===

  router.post('/diagnose-deck', async (req, res) => {
    try {
      const { playerName, deckId } = req.body;
      if (!playerName || !deckId) {
        return res.status(400).json({ error: 'Player name and deckId are required' });
      }

      const player = await prisma.player.findUnique({ where: { name: playerName } });
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const savedDeck = await prisma.savedDeck.findFirst({
        where: { id: deckId, playerId: player.id },
      });
      if (!savedDeck) return res.status(404).json({ error: 'Saved deck not found' });

      const cards: string[] = JSON.parse(savedDeck.cards);
      const levels: Record<string, number> = JSON.parse(player.levels);
      const targetLevel = 16;

      // Стоимости апгрейда с 1 по 16
      const upgradeCosts: Record<number, number> = {
        1: 0, 2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1000, 8: 2000,
        9: 4000, 10: 8000, 11: 20000, 12: 50000, 13: 100000, 14: 200000, 15: 400000, 16: 800000
      };

      const diagnosis = cards.map((cardId: string) => {
        const currentLevel = levels[cardId] || 1;
        let cost = 0;
        for (let lv = currentLevel; lv < targetLevel; lv++) {
          cost += upgradeCosts[lv] || 0;
        }
        return {
          card: cardId,
          currentLevel,
          neededGold: cost,
        };
      });

      const totalGold = diagnosis.reduce((sum, item) => sum + item.neededGold, 0);

      res.json({
        success: true,
        deckName: savedDeck.name,
        totalGold,
        details: diagnosis,
        targetLevel,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Diagnose failed' });
    }
  });

  return router;
};
