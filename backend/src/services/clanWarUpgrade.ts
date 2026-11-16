import { findClanWarCombinations } from './clanWarCombinations';
import { diagnoseUpgrades } from './upgradeDiagnosis';
import { readPlayerResources, summarizeUpgradeResources } from './playerResources';
import { getRequiredForms } from './budgetUpgrade';

type PlannedDeck = {
  deckId: string;
  name: string;
  cards: string[];
  slot2Type?: string | null;
};

export function planClanWarUpgrade(
  decks: PlannedDeck[],
  levels: Record<string, number>,
  targetLevel: number,
  pinned: ReadonlySet<string>,
  required: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
  resources = readPlayerResources(),
  evolutions: string[] = [],
  heroes: string[] = [],
) {
  const cardKey = (card: string) => card === 'Log' ? 'The Log' : card;
  const costs = new Map(diagnoseUpgrades([...new Set(decks.flatMap(deck => deck.cards.map(cardKey)))],
    levels, targetLevel, true).details.map(detail => [detail.card, detail]));
  const emptyWildcards = readPlayerResources().wildcards;
  const candidates = decks.flatMap(({ deckId, name, cards, slot2Type }) => {
    const keys = cards.map(cardKey);
    if (keys.length !== 8 || new Set(keys).size !== 8) return [];
    const details = keys.map(card => costs.get(card)!);
    if (details.some(detail => !detail.rarity)) return [];
    const totalGold = details.reduce((sum, detail) => sum + detail.neededGold, 0);
    const { uncoveredCopiesByRarity } = summarizeUpgradeResources(details, totalGold, { ...resources, wildcards: emptyWildcards });
    const lacksUnlockCopy = details.some(detail => detail.currentLevel === 0);
    const forms = getRequiredForms(keys, slot2Type ?? null, evolutions, heroes, { ...resources, universalShards: 0 });
    return [{
      deckId, name, cards: keys, score: -totalGold, slot2Type, uncoveredCopiesByRarity, lacksUnlockCopy,
      shards: forms.reduce((sum, form) => sum + form.missingShards, 0),
      heroCoins: forms.reduce((sum, form) => sum + form.heroCoins, 0),
    }];
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
  type Candidate = typeof candidates[number];
  const rarities = Object.keys(resources.wildcards) as (keyof typeof resources.wildcards)[];
  function fitsBudget(selected: readonly Candidate[], score: number) {
    if (-score > resources.gold || selected.some(deck => deck.lacksUnlockCopy)) return false;
    if (selected.reduce((sum, deck) => sum + deck.shards, 0) > resources.universalShards ||
        selected.reduce((sum, deck) => sum + deck.heroCoins, 0) > resources.heroCoins) return false;
    return rarities.every(rarity =>
      selected.reduce((sum, deck) => sum + (deck.uncoveredCopiesByRarity[rarity] ?? 0), 0) <= resources.wildcards[rarity]);
  }
  const affordableDecks = eligible.filter(deck => fitsBudget([deck], deck.score));
  const [affordable] = findClanWarCombinations(affordableDecks, pinned, 1, 4, required, fitsBudget);
  const cheapest = affordable ?? findClanWarCombinations(eligible, pinned, 1, 4, required)[0];
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
  const totalGold = details.reduce((sum, detail) => sum + detail.neededGold, 0);
  let remainingShards = resources.universalShards;
  const forms = cheapest.decks.flatMap(deck => {
    const needed = getRequiredForms(deck.cards, deck.slot2Type ?? null, evolutions, heroes,
      { ...resources, universalShards: remainingShards }).filter(form => !form.unlocked);
    remainingShards -= needed.reduce((sum, form) => sum + form.universalShards, 0);
    return needed;
  });
  const heroCoins = forms.reduce((sum, form) => sum + form.heroCoins, 0);
  return { upgradePlan: {
    targetLevel,
    totalGold,
    decks: cheapest.decks.map(({ deckId, name, cards }) => ({ deckId, name, cards })),
    missingCards: details.filter(detail => detail.currentLevel === 0).map(detail => detail.card),
    ...summarizeUpgradeResources(details, totalGold, resources),
    affordable: Boolean(affordable),
    forms,
    shardDeficit: forms.reduce((sum, form) => sum + form.missingShards, 0),
    heroCoinDeficit: Math.max(0, heroCoins - resources.heroCoins),
  } };
}
