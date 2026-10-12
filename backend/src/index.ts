import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createPlayersRouter } from './routes/players';
import { createMetaDecksRouter } from './routes/metaDecks';
import { createRecommendationsRouter } from './routes/recommendations';
import healthRouter from './routes/health';

dotenv.config();

const prisma = new PrismaClient();
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api', createPlayersRouter(prisma));
app.use('/api', createMetaDecksRouter(prisma));
app.use('/api', createRecommendationsRouter(prisma));
app.use(healthRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\u2713 Server running on http://localhost:' + PORT);
});
