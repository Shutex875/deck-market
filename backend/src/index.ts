import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app';

dotenv.config();
process.env.DATABASE_URL ??= 'file:../data/bastdecks.db';

const app = createApp(new PrismaClient());

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\u2713 Server running on http://localhost:' + PORT);
});
