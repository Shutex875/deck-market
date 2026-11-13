import { Router } from 'express';
import axios from 'axios';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { userId } from './auth';

function storedJson(schema: z.ZodType) {
  return z.string().refine(value => {
    try { return schema.safeParse(JSON.parse(value)).success; }
    catch { return false; }
  });
}

const profileData = z.object({
  tag: z.string().max(32).nullable().optional(),
  levels: storedJson(z.record(z.string(), z.number().int().nonnegative())).optional(),
  evolutions: storedJson(z.array(z.string())).optional(),
  heroes: storedJson(z.array(z.string())).optional(),
});
const createProfile = profileData.extend({ name: z.string().trim().min(1).max(80) });
const progressData = z.object({
  playerName: z.string().min(1),
  playerScore: z.number().int().nonnegative(),
  computerScore: z.number().int().nonnegative(),
  record: z.number().int().nonnegative().default(0),
});

export const createPlayersRouter = (prisma: PrismaClient): Router => {
  const router = Router();

  router.get('/game-progress/:playerName', async (req, res) => {
    const { playerName } = req.params;
    try {
      const progress = await prisma.gameProgress.findFirst({
        where: { player: { name: playerName, ownerId: userId(res) } },
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
    const parsed = progressData.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Не все поля заполнены' });
    }
    const { playerName, ...scores } = parsed.data;
    try {
      const player = await prisma.player.findUnique({
        where: { ownerId_name: { name: playerName, ownerId: userId(res) } },
      });
      if (!player) {
        return res.status(404).json({ error: 'Игрок не найден' });
      }
  
      const progress = await prisma.gameProgress.upsert({
        where: { playerId: player.id },
        update: scores,
        create: { playerId: player.id, ...scores },
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
  
  
  router.get('/players', async (_req, res) => {
    try {
      const players = await prisma.player.findMany({
        where: { ownerId: userId(res) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      res.json(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch players' });
    }
  });
  
  router.post('/players', async (req, res) => {
    const parsed = createProfile.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные аккаунта' });
    try {
      const player = await prisma.player.create({
        data: { levels: '{}', evolutions: '[]', heroes: '[]', ...parsed.data, ownerId: userId(res) },
      });
      res.status(201).json(player);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return res.status(409).json({ error: 'У вас уже есть аккаунт с таким именем' });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to save player' });
    }
  });

  router.put('/players/:name', async (req, res) => {
    const parsed = profileData.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные аккаунта' });
    const { count } = await prisma.player.updateMany({
      where: { name: req.params.name, ownerId: userId(res) },
      data: parsed.data,
    });
    if (!count) return res.status(404).json({ error: 'Player not found' });
    res.json({ success: true });
  });
  
  router.get('/players/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const player = await prisma.player.findUnique({
        where: { ownerId_name: { name, ownerId: userId(res) } },
      });
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
      const { count } = await prisma.player.deleteMany({ where: { name, ownerId: userId(res) } });
      if (!count) return res.status(404).json({ error: 'Player not found' });
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
