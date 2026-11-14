import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { startCollectionChecks } from './services/collectionSync';

dotenv.config();
process.env.DATABASE_URL ??= 'file:../data/bastdecks.db';

const prisma = new PrismaClient();
const app = createApp(prisma);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  startCollectionChecks(prisma);
  console.log('\u2713 Server running on http://localhost:' + PORT);
});
