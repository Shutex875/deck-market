import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireCatalogOwner } from './auth';

const pageQuery = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSize = 25;
const roleUpdate = z.object({ role: z.enum(['user', 'admin']) });

export function createAdminRouter(prisma: PrismaClient) {
  const router = Router();
  router.use(requireCatalogOwner);

  router.get('/overview', async (req, res) => {
    const page = pageQuery.safeParse(req.query.page);
    if (!page.success) return res.status(400).json({ error: 'Некорректный номер страницы' });

    const [users, players, metaDecks, savedDecks, accounts] = await prisma.$transaction([
      prisma.user.count(),
      prisma.player.count({ where: { ownerId: { not: null } } }),
      prisma.metaDeck.count(),
      prisma.savedDeck.count(),
      prisma.user.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page.data - 1) * pageSize,
        take: pageSize,
        select: { id: true, username: true, isAdmin: true, createdAt: true, _count: { select: { players: true } } },
      }),
    ]);

    res.json({
      totals: { users, players, metaDecks, savedDecks },
      accounts: accounts.map(({ id, username, isAdmin, createdAt, _count }) => ({
        id, username, isAdmin, createdAt, profiles: _count.players, isOwner: id === process.env.CATALOG_OWNER_ID,
      })),
      pageCount: Math.max(1, Math.ceil(users / pageSize)),
    });
  });

  router.patch('/users/:id/role', async (req, res) => {
    if (res.locals.user.isOwner !== true) {
      return res.status(403).json({ error: 'Менять роли может только владелец' });
    }
    const { id } = req.params;
    const parsed = roleUpdate.safeParse(req.body);
    if (typeof id !== 'string' || !parsed.success) {
      return res.status(400).json({ error: 'Некорректная роль или пользователь' });
    }
    if (id === process.env.CATALOG_OWNER_ID) {
      return res.status(409).json({ error: 'Роль владельца закреплена' });
    }
    const { count } = await prisma.user.updateMany({ where: { id }, data: { isAdmin: parsed.data.role === 'admin' } });
    if (!count) return res.status(404).json({ error: 'Пользователь не найден' });
    res.sendStatus(204);
  });
  return router;
}
