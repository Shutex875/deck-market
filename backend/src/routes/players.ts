import { Router } from 'express';
import axios from 'axios';
import type { PrismaClient } from '@prisma/client';

export const createPlayersRouter = (prisma: PrismaClient): Router => {
  const router = Router();

  router.get('/game-progress/:playerName', async (req, res) => {
    const { playerName } = req.params;
    try {
      const progress = await prisma.gameProgress.findUnique({
        where: { playerName },
      });
      if (!progress) {
        return res.status(404).json({ error: 'Прогресс не найден' });
      }
      res.json({
        playerScore: progress.playerScore,
        computerScore: progress.computerScore,
        record: progress.record,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Ошибка загрузки прогресса' });
    }
  });
  
  // Сохранить (или обновить) прогресс
  router.post('/game-progress', async (req, res) => {
    const { playerName, playerScore, computerScore, record } = req.body;
    if (playerName === undefined || playerScore === undefined || computerScore === undefined) {
      return res.status(400).json({ error: 'Не все поля заполнены' });
    }
    try {
      const player = await prisma.player.findUnique({
        where: { name: playerName },
      });
      if (!player) {
        return res.status(404).json({ error: 'Игрок не найден' });
      }
  
      const progress = await prisma.gameProgress.upsert({
        where: { playerName },
        update: {
          playerScore,
          computerScore,
          record: record || 0,
        },
        create: {
          playerName,
          playerScore,
          computerScore,
          record: record || 0,
          player: { connect: { name: playerName } },
        },
      });
      res.json({
        playerScore: progress.playerScore,
        computerScore: progress.computerScore,
        record: progress.record,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Ошибка сохранения прогресса' });
    }
  });
  
  
  router.get('/players', async (req, res) => {
    try {
      const players = await prisma.player.findMany({ orderBy: { name: 'asc' } });
      res.json(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch players' });
    }
  });
  
  router.post('/players', async (req, res) => {
    try {
      const { name, tag, levels, evolutions, heroes } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
  
      const existing = await prisma.player.findUnique({ where: { name } });
      if (existing) {
        const updated = await prisma.player.update({
          where: { name },
          data: {
            levels: levels || existing.levels,
            evolutions: evolutions || existing.evolutions,
            heroes: heroes || existing.heroes,
            tag: tag === undefined ? existing.tag : tag || null,
          }
        });
        return res.json(updated);
      } else {
        const newPlayer = await prisma.player.create({
          data: { name, tag: tag || null, levels: levels || '{}', evolutions: evolutions || '[]', heroes: heroes || '[]' }
        });
        return res.json(newPlayer);
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to save player' });
    }
  });
  
  router.get('/players/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const player = await prisma.player.findUnique({ where: { name } });
      if (!player) return res.status(404).json({ error: 'Player not found' });
      res.json(player);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch player' });
    }
  });
  
  router.delete('/players/:name', async (req, res) => {
    try {
      const { name } = req.params;
      await prisma.player.delete({ where: { name } });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete player' });
    }
  });

    router.get('/player-stats/:tag', async (req, res) => {
      const tag = req.params.tag.replace(/^#/, '');
      if (!tag) return res.status(400).json({ error: 'Player tag is required' });

      const token = process.env.CLASH_ROYALE_API_TOKEN;
      if (!token) {
        return res.status(503).json({ error: 'Clash Royale API is not configured' });
      }

      try {
        const response = await axios.get(
          'https://api.clashroyale.com/v1/players/' + encodeURIComponent('#' + tag),
          { headers: { Authorization: 'Bearer ' + token } }
        );
        res.json(response.data);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error('Clash Royale API request failed:', error.message);
          if (error.response?.status === 404) {
            return res.status(404).json({ error: 'Player not found' });
          }
        } else {
          console.error('Clash Royale API request failed:', error);
        }
        res.status(502).json({ error: 'Failed to fetch player stats from Clash Royale API' });
      }
    });

  return router;
};
