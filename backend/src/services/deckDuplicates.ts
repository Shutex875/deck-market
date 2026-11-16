import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { ALL_CARDS_DATA, cardDataMap } from '../config/cards';

const normalize = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '');
const baseIds = new Map(ALL_CARDS_DATA.flatMap(card =>
  [card.file, card.id].map(alias => [normalize(alias), card.id] as const)
));
baseIds.set('log', 'The Log');

export function normalizeDeckCards(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 8) return null;
  const cards = value.map(card => typeof card === 'string' ? baseIds.get(normalize(card)) : undefined);
  if (!cards.every((card): card is string => Boolean(card)) || new Set(cards).size !== 8) return null;
  return cards;
}

export function readDeckCards(cards: string) {
  try {
    return normalizeDeckCards(JSON.parse(cards));
  } catch {
    return null;
  }
}

type SlotType = string | null | undefined;

function specialSlots(cards: string[], slot2Type: SlotType, owned?: { evolutions: string; heroes: string }) {
  const owns = (form: 'evo' | 'hero', id: string) => {
    if (!owned) return true;
    try {
      const ids: unknown = JSON.parse(form === 'evo' ? owned.evolutions : owned.heroes);
      return Array.isArray(ids) && ids.includes(id);
    } catch {
      return false;
    }
  };
  return JSON.stringify(cards.slice(0, 3).map((id, index) => {
    const card = cardDataMap[id];
    if (card.champion && index > 0) return ['champion', id];
    const thirdSlotEvo = index === 2 && (owned || slot2Type === 'evo' || (!slot2Type && !card.heroFile));
    const thirdSlotHero = index === 2 && (owned || slot2Type === 'hero' || (!slot2Type && !card.evoFile));
    if ((index === 0 || thirdSlotEvo) && card.evoFile && owns('evo', id)) return ['evo', id];
    if ((index === 1 || thirdSlotHero) && card.heroFile && owns('hero', id)) return ['hero', id];
    return null;
  }));
}

type DeckMatch = {
  id: string;
  name: string;
  location: 'meta' | 'saved';
  playerName?: string;
} & (
  { kind: 'exact' | 'special-slots' } |
  { kind: 'similar'; draftCard: string; existingCard: string }
);

export async function findDeckMatches(
  db: Pick<Prisma.TransactionClient, 'metaDeck' | 'savedDeck'>,
  ownerId: string,
  draft: { cards: string[]; slot2Type?: SlotType; editId?: string },
): Promise<DeckMatch[]> {
  const select = { id: true, name: true, cards: true } as const;
  const [meta, saved] = await Promise.all([
    db.metaDeck.findMany({
      where: draft.editId ? { id: { not: draft.editId } } : undefined,
      select: { ...select, slot2Type: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    db.savedDeck.findMany({
      where: { player: { ownerId } },
      select: { ...select, player: { select: { name: true, evolutions: true, heroes: true } } },
      orderBy: [{ player: { name: 'asc' } }, { createdAt: 'desc' }, { id: 'asc' }],
    }),
  ]);
  const draftIds = new Set(draft.cards);
  const draftSlots = specialSlots(draft.cards, draft.slot2Type);
  const matches: DeckMatch[] = [];
  for (const deck of [...meta, ...saved]) {
    if ('slot2Type' in deck && deck.id === draft.editId) continue;
    const cards = readDeckCards(deck.cards);
    if (!cards) continue;
    const outsideDraft = cards.filter(id => !draftIds.has(id));
    if (outsideDraft.length > 1) continue;
    const where = 'player' in deck
      ? { location: 'saved' as const, playerName: deck.player.name }
      : { location: 'meta' as const };
    const entry = { id: deck.id, name: deck.name, ...where };
    if (outsideDraft.length === 1) {
      const draftCard = draft.cards.find(id => !cards.includes(id))!;
      matches.push({ ...entry, kind: 'similar', draftCard, existingCard: outsideDraft[0] });
    } else {
      const slots = 'player' in deck
        ? specialSlots(cards, null, deck.player)
        : specialSlots(cards, deck.slot2Type);
      matches.push({ ...entry, kind: slots === draftSlots ? 'exact' : 'special-slots' });
    }
  }
  const priority = { exact: 0, 'special-slots': 1, similar: 2 };
  return matches.sort((a, b) => priority[a.kind] - priority[b.kind]);
}

export async function checkDeckWrite(
  tx: Prisma.TransactionClient,
  ownerId: string,
  draft: { name: string; cards: string[]; slot2Type?: SlotType; editId?: string },
  confirmation: unknown,
) {
  const matches = (await findDeckMatches(tx, ownerId, draft)).filter(match => match.kind !== 'similar');
  if (matches.length === 0) return null;

  if (draft.editId) {
    const existing = await tx.metaDeck.findUnique({
      where: { id: draft.editId }, select: { name: true, cards: true, slot2Type: true },
    });
    const cards = existing && readDeckCards(existing.cards);
    if (existing?.name === draft.name && cards?.every(id => draft.cards.includes(id)) &&
        specialSlots(cards, existing.slot2Type) === specialSlots(draft.cards, draft.slot2Type)) return null;
  }

  if (matches.some(match => match.name === draft.name &&
    (match.kind === 'exact' || match.location === 'meta'))) {
    return { matches, error: 'Выберите другое название для варианта колоды' };
  }
  const duplicateConfirmation = createHash('sha256')
    .update(JSON.stringify([ownerId, draft, matches])).digest('hex');
  if (confirmation === duplicateConfirmation) return null;
  return { matches, duplicateConfirmation, error: 'Подтвердите сохранение варианта колоды' };
}
