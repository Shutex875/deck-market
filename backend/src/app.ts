import express from 'express';
import cors from 'cors';
import type { PrismaClient } from '@prisma/client';
import { createAuthRouter, protectApi, requireSession } from './routes/auth';
import { createPlayersRouter } from './routes/players';
import { createMetaDecksRouter } from './routes/metaDecks';
import { createRecommendationsRouter } from './routes/recommendations';
import healthRouter from './routes/health';
import { createAdminRouter } from './routes/admin';

export function createApp(prisma: PrismaClient) {
  const app = express();
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(healthRouter);
  app.use('/api', protectApi);
  app.use('/api/auth', express.json({ limit: '8kb' }), createAuthRouter(prisma));
  app.use('/api', requireSession(prisma), express.json({ limit: '10mb' }));
  app.use('/api/admin', createAdminRouter(prisma));
  app.use('/api', createPlayersRouter(prisma));
  app.use('/api', createMetaDecksRouter(prisma));
  app.use('/api', createRecommendationsRouter(prisma));
  return app;
}
