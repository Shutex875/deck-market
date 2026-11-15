import { findClanWarCombinations } from './clanWarCombinations';
import { diagnoseUpgrades } from './upgradeDiagnosis';

export function planClanWarUpgrade(
  decks: { deckId: string; name: string; cards: string[] }[],
  levels: Record<string, number>,
  targetLevel: number,
  pinned: ReadonlySet<string>,
  required: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
) {
  const cardKey = (card: string) => card === 'Log' ? 'The Log' : card;
  const costs = new Map(diagnoseUpgrades([...new Set(decks.flatMap(deck => deck.cards.map(cardKey)))],
    levels, targetLevel).details.map(detail => [detail.card, detail]));
  const candidates = decks.flatMap(({ deckId, name, cards }) => {
    const keys = cards.map(cardKey);
    if (keys.length !== 8 || new Set(keys).size !== 8) return [];
    const details = keys.map(card => costs.get(card)!);
    if (details.some(detail => !detail.rarity)) return [];
    const totalGold = details.reduce((sum, detail) => sum + detail.neededGold, 0);
    return [{ deckId, name, cards: keys, score: -totalGold }];
  });
  if ([...pinned].some(id => !candidates.some(deck => deck.deckId === id))) {
    return { upgradePlanBlocker: 'Одна из закреплённых колод неполная или содержит карту без данных о прокачке.' };
  }
  const eligible = candidates.filter(deck => !deck.cards.some(card => excluded.has(card)));
  if ([...pinned].some(id => !eligible.some(deck => deck.deckId === id))) {
    return { upgradePlanBlocker: 'В закреплённой колоде есть исключённая карта.' };
  }
  const pinnedCards = eligible.filter(deck => pinned.has(deck.deckId)).flatMap(deck => deck.cards);
  if (new Set(pinnedCards).size !== pinnedCards.length) {
    return { upgradePlanBlocker: 'Закреплённые колоды содержат одинаковые карты.' };
  }
  const [cheapest] = findClanWarCombinations(eligible, pinned, 1, 4, required);
  if (!cheapest) {
    const empty = new Set<string>();
    if (required.size && findClanWarCombinations(eligible, pinned, 1, 4).length) {
      return { upgradePlanBlocker: 'Обязательные карты не помещаются в допустимую четвёрку. Ослабьте этот фильтр.' };
    }
    if (excluded.size && findClanWarCombinations(candidates, pinned, 1, 4, required).length) {
      return { upgradePlanBlocker: 'Фильтр исключённых карт убирает допустимые четвёрки. Ослабьте этот фильтр.' };
    }
    if (pinned.size && findClanWarCombinations(eligible, empty, 1, 4, required).length) {
      return { upgradePlanBlocker: 'Закрепления не позволяют собрать четвёрку. Снимите одно или несколько закреплений.' };
    }
    return { upgradePlanBlocker: eligible.length < 4
      ? 'После фильтрации осталось меньше четырёх полных колод с известной стоимостью.'
      : 'С текущими закреплениями и фильтрами нет четырёх колод без пересечений.' };
  }
  const details = cheapest.decks.flatMap(deck => deck.cards.map(card => costs.get(card)!));
  const copiesByRarity: Record<string, number> = {};
  for (const detail of details) {
    if (!detail.rarity || !detail.neededCards) continue;
    copiesByRarity[detail.rarity] = (copiesByRarity[detail.rarity] ?? 0) + detail.neededCards;
  }
  return { upgradePlan: {
    targetLevel,
    totalGold: details.reduce((sum, detail) => sum + detail.neededGold, 0),
    decks: cheapest.decks.map(({ deckId, name, cards }) => ({ deckId, name, cards })),
    missingCards: details.filter(detail => detail.currentLevel === 0).map(detail => detail.card),
    copiesByRarity,
  } };
}
