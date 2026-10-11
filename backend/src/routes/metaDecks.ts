import axios from 'axios';
import * as cheerio from 'cheerio';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ALL_CARDS } from '../config/cards';

export const createMetaDecksRouter = (prisma: PrismaClient): Router => {
  const router = Router();

  router.get('/meta-decks', async (req, res) => {
    try {
      const decks = await prisma.metaDeck.findMany({
        orderBy: { name: 'asc' },
        include: { category: true, source: true }
      });
      res.json(decks);
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
      const { name, cards, slot2Type, tier, winRate, categoryId, sourceId, sourceUrl } = req.body;
      if (!name || !cards || !Array.isArray(cards) || cards.length !== 8) {
        return res.status(400).json({ error: 'Name and exactly 8 cards are required' });
      }
      if (!categoryId || !sourceId) {
        return res.status(400).json({ error: 'categoryId and sourceId are required' });
      }
      const updated = await prisma.metaDeck.update({
        where: { id },
        data: {
          name,
          cards: JSON.stringify(cards),
          slot2Type: slot2Type || null,
          tier: tier || null,
          winRate: winRate ? parseFloat(winRate) : null,
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
      const { name, cards, slot2Type, tier, winRate, categoryId, sourceId, sourceUrl, externalId } = req.body;
      if (!name || !cards || !Array.isArray(cards) || cards.length !== 8) {
        return res.status(400).json({ error: 'Name and exactly 8 cards are required' });
      }
      if (!categoryId || !sourceId) {
        return res.status(400).json({ error: 'categoryId and sourceId are required' });
      }
      const newDeck = await prisma.metaDeck.create({
        data: {
          name,
          cards: JSON.stringify(cards),
          slot2Type: slot2Type || null,
          tier: tier || null,
          winRate: winRate ? parseFloat(winRate) : null,
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
        where: { name: 'mock' },
        update: {},
        create: { name: 'mock' },
      });
      const generalCategory = await prisma.category.upsert({
        where: { name: 'general' },
        update: {},
        create: { name: 'general' },
      });
  
      const mockDecks = [
        { name: 'Hog 2.6 Cycle', cards: ['Hog Rider', 'Musketeer', 'Ice Golem', 'Skeleton', 'Ice Spirit', 'Cannon', 'Fireball', 'Log'], slot2Type: null, tier: 'S', winRate: 52.5 },
        { name: 'Golem Beatdown', cards: ['Golem', 'Night Witch', 'Dark Prince', 'Tornado', 'Lightning', 'Barbarian Barrel', 'Baby Dragon', 'Mega Minion'], slot2Type: null, tier: 'A', winRate: 50.1 },
      ];
  
      let imported = 0;
      for (const deck of mockDecks) {
        const existing = await prisma.metaDeck.findUnique({ where: { name: deck.name } });
        if (!existing) {
          await prisma.metaDeck.create({
            data: {
              name: deck.name,
              cards: JSON.stringify(deck.cards),
              slot2Type: deck.slot2Type || null,
              tier: deck.tier || null,
              winRate: deck.winRate || null,
              sourceId: mockSource.id,
              categoryId: generalCategory.id,
              isActive: true,
            }
          });
          imported++;
        }
      }
      res.json({ success: true, imported, message: `Импортировано ${imported} мок-колод` });
    } catch (error: any) {
      console.error('Mock import error:', error.message);
      res.status(500).json({ error: 'Ошибка импорта мок-колод' });
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
