import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
process.env.DATABASE_URL ??= 'file:../data/bastdecks.db';
const prisma = new PrismaClient();

async function main() {
  const [login, confirmation] = process.argv.slice(2);
  if (!login || confirmation !== '--all') {
    throw new Error('Использование: npm run accounts:claim -- <логин> --all');
  }
  const username = login.normalize('NFKC').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new Error('Сначала зарегистрируйте пользователя с этим логином.');

  const { count } = await prisma.player.updateMany({
    where: { ownerId: null },
    data: { ownerId: user.id },
  });
  console.log(`Привязано игровых аккаунтов: ${count}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
