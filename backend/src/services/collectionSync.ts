import axios from 'axios';
import { createHash, randomUUID } from 'node:crypto';
import type { Player, PrismaClient } from '@prisma/client';
import { mapClashRoyalePlayerToAccount } from './clashRoyaleCollection';

const checkInterval = 6 * 60 * 60 * 1000;
const retryInterval = 60 * 60 * 1000;

interface CollectionPreview {
  id: string;
  revision: string;
  partial: boolean;
  levels: { card: string; from: number; to: number }[];
  evolutions: string[];
  heroes: string[];
}

export class CollectionCheckError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function collectionRevision(player: Player) {
  return createHash('sha256').update(JSON.stringify([
    player.tag, player.levels, player.evolutions, player.heroes,
  ])).digest('hex');
}

export function readCollectionPreview(player: Player) {
  const preview = player.collectionPreview
    ? JSON.parse(player.collectionPreview) as CollectionPreview
    : null;
  return preview?.revision === collectionRevision(player) ? preview : null;
}

export async function checkCollection(prisma: PrismaClient, player: Player) {
  const tag = player.tag?.trim().replace(/^#/, '').toUpperCase();
  if (!tag) throw new CollectionCheckError(400, 'Укажите тег игрового профиля');
  const token = process.env.CLASH_ROYALE_API_TOKEN;
  if (!token) throw new CollectionCheckError(503, 'Токен API Clash Royale не настроен');
  const started = new Date();
  const claim = await prisma.player.updateMany({
    where: { id: player.id, tag: player.tag, collectionCheckAttemptAt: player.collectionCheckAttemptAt },
    data: { collectionCheckAttemptAt: started },
  });
  if (!claim.count) throw new CollectionCheckError(409, 'Проверка уже запущена. Обновите список профилей');

  const response = await axios.get('https://api.clashroyale.com/v1/players/' + encodeURIComponent('#' + tag), {
    headers: { Authorization: 'Bearer ' + token },
    timeout: 10000,
  });
  const observed = mapClashRoyalePlayerToAccount(response.data);
  if (!observed.recognizedCards) throw new CollectionCheckError(502, 'API не вернул распознанные карты');
  const levels: Record<string, number> = JSON.parse(player.levels);
  const knownEvolutions: string[] = JSON.parse(player.evolutions);
  const knownHeroes: string[] = JSON.parse(player.heroes);
  const previous = readCollectionPreview(player);
  const observedLevels = { ...observed.levels };
  for (const { card, to } of previous?.levels ?? []) {
    observedLevels[card] = Math.max(observedLevels[card] ?? 0, to);
  }
  const levelChanges = Object.entries(observedLevels).flatMap(([card, to]) => {
    const from = levels[card] ?? (card === 'The Log' ? levels.Log : undefined) ?? 0;
    return to > from ? [{ card, from, to }] : [];
  });
  const evolutions = [...new Set([...(previous?.evolutions ?? []), ...observed.evolutions])]
    .filter(card => !knownEvolutions.includes(card));
  const heroes = [...new Set([...(previous?.heroes ?? []), ...observed.heroes])]
    .filter(card => !knownHeroes.includes(card));
  const preview = levelChanges.length || evolutions.length || heroes.length ? {
    id: previous && JSON.stringify([previous.levels, previous.evolutions, previous.heroes]) ===
      JSON.stringify([levelChanges, evolutions, heroes]) ? previous.id : randomUUID(),
    revision: collectionRevision(player), partial: !observed.usedFullCollection,
    levels: levelChanges, evolutions, heroes,
  } : null;
  const saved = await prisma.player.updateMany({
    where: {
      id: player.id, tag: player.tag, collectionCheckAttemptAt: started,
      levels: player.levels, evolutions: player.evolutions, heroes: player.heroes,
    },
    data: { collectionCheckedAt: new Date(), collectionPreview: preview ? JSON.stringify(preview) : null },
  });
  if (!saved.count) throw new CollectionCheckError(409, 'Профиль изменился. Проверьте обновления ещё раз');
  return preview;
}

export function startCollectionChecks(prisma: PrismaClient) {
  let running = false;
  const run = async () => {
    if (running || !process.env.CLASH_ROYALE_API_TOKEN) return;
    running = true;
    try {
      const now = Date.now();
      const profiles = await prisma.player.findMany({
        where: {
          ownerId: { not: null },
          tag: { not: null, notIn: ['', '#'] },
          AND: [
            { OR: [{ collectionCheckedAt: null }, { collectionCheckedAt: { lte: new Date(now - checkInterval) } }] },
            { OR: [{ collectionCheckAttemptAt: null }, { collectionCheckAttemptAt: { lte: new Date(now - retryInterval) } }] },
          ],
        },
        orderBy: [{ collectionCheckAttemptAt: 'asc' }, { id: 'asc' }],
        take: 30,
      });
      for (const profile of profiles) {
        if (profile.tag?.trim()) await checkCollection(prisma, profile).catch(() => {});
      }
    } catch (error) {
      console.error('Collection scheduler failed:', error);
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(run, 60 * 1000).unref();
}
