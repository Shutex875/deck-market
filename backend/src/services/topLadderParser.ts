import { ALL_CARDS_DATA } from '../config/cards';

const normalizeCardName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const cardIdByApiName = new Map(
  ALL_CARDS_DATA.flatMap(card => [card.id, card.file].map(alias => [normalizeCardName(alias), card.id] as const)),
);
for (const [name, id] of Object.entries({
  skeletons: 'Skeleton',
  'minion horde': 'Horde',
  'royal delivery': 'RoyalDelivery',
})) {
  cardIdByApiName.set(normalizeCardName(name), id);
}

export function parseTopLadderDeck(cards: unknown): { cards: string[]; compositionKey: string } | { error: string } {
  if (!Array.isArray(cards) || cards.length === 0) return { error: 'Пустой массив карт' };
  if (cards.length !== 8) return { error: `Ожидалось 8 карт, получено ${cards.length}` };

  const names = cards.map(card => typeof card?.name === 'string' ? card.name.trim() : '');
  if (names.some(name => !name)) return { error: 'В ответе есть карта без названия' };

  const ids = names.map(name => cardIdByApiName.get(normalizeCardName(name)));
  const missing = names.filter((_, index) => !ids[index]);
  if (missing.length) return { error: `Не найдены карты в каталоге: ${missing.join(', ')}` };

  const canonical = ids.filter((id): id is string => id !== undefined);
  if (new Set(canonical).size !== 8) {
    return { error: `Дубликат ID карты после маппинга: ${canonical.join(', ')}` };
  }
  return { cards: canonical, compositionKey: JSON.stringify([...canonical].sort()) };
}
