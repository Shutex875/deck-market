import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireCatalogOwner } from './auth';

const pageQuery = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSize = 25;

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
        select: { id: true, username: true, createdAt: true, _count: { select: { players: true } } },
      }),
    ]);

    res.json({
      totals: { users, players, metaDecks, savedDecks },
      accounts: accounts.map(({ id, username, createdAt, _count }) => ({
        id, username, createdAt, profiles: _count.players, isOwner: id === process.env.CATALOG_OWNER_ID,
      })),
      pageCount: Math.max(1, Math.ceil(users / pageSize)),
    });
  });
  return router;
}
