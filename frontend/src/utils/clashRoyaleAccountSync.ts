import { ClashRoyaleCard, ClashRoyalePlayerStats } from '../api';
import { ALL_CARDS_DATA, getEvoCards } from '../data/cards';

export interface SyncedAccountData {
  levels: Record<string, string>;
  evolutions: string[];
  heroes: string[];
  recognizedCards: number;
  usedFullCollection: boolean;
}

const CARD_NAME_ALIASES: Record<string, string> = {
  skeletons: 'Skeleton',
  log: 'The Log',
  edragon: 'Electro Dragon',
};

const normalizeName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const getCardId = (name: string): string | undefined => {
  const normalizedName = normalizeName(name);
  const alias = CARD_NAME_ALIASES[normalizedName];
  if (alias) return alias;

  return ALL_CARDS_DATA.find(card => normalizeName(card.id) === normalizedName)?.id;
};

const getListedCardName = (entry: string | { name?: string; card?: { name?: string } }): string | undefined => {
  if (typeof entry === 'string') return entry;
  return entry.name || entry.card?.name;
};

const hasEvolution = (card: ClashRoyaleCard): boolean =>
  (card.evolutionLevel ?? 0) > 0 ||
  (card.evoLevel ?? 0) > 0 ||
  card.isEvolved === true ||
  card.isEvolutionUnlocked === true ||
  (card.evolution?.level ?? 0) > 0 ||
  card.evolution?.unlocked === true ||
  card.evolution?.isUnlocked === true;

const hasPositiveLevel = (level: number | string | undefined): boolean => {
  const numericLevel = Number(level);
  return Number.isFinite(numericLevel) && numericLevel > 0;
};

const hasHeroUpgrade = (card: ClashRoyaleCard): boolean =>
  hasPositiveLevel(card.heroLevel) ||
  card.isHero === true ||
  card.isHeroUnlocked === true ||
  card.variant?.toLowerCase() === 'hero' ||
  hasPositiveLevel(card.hero?.level) ||
  card.hero?.unlocked === true ||
  card.hero?.isUnlocked === true;

const isHeroUpgradeCard = (cardId: string): boolean =>
  ALL_CARDS_DATA.some(card => card.id === cardId && card.heroFile !== undefined && !card.champion);

export const isHeroUpgradeId = (cardId: string): boolean => isHeroUpgradeCard(cardId);

export const mapClashRoyalePlayerToAccount = (
  player: ClashRoyalePlayerStats
): SyncedAccountData => {
  const usedFullCollection = Array.isArray(player.cards) && player.cards.length > 0;
  const cardEntries = usedFullCollection
    ? player.cards || []
    : player.currentDeck || [];
  const levels: Record<string, string> = {};
  const evolutions = new Set<string>();
  const heroes = new Set<string>();
  const evoCardIds = new Set(getEvoCards().map(card => card.id));
  const recognizedIds = new Set<string>();

  cardEntries.forEach(card => {
    const cardId = getCardId(card.name);
    if (!cardId) return;

    const cardData = ALL_CARDS_DATA.find(item => item.id === cardId);
    if (!cardData) return;
    recognizedIds.add(cardId);

    if (
      typeof card.level === 'number' &&
      Number.isFinite(card.level) &&
      typeof card.maxLevel === 'number' &&
      Number.isFinite(card.maxLevel) &&
      card.maxLevel > 0
    ) {
      const absoluteLevel = 16 - (card.maxLevel - card.level);
      levels[cardId] = String(Math.min(16, Math.max(1, Math.trunc(absoluteLevel))));
    }

    if (cardData.evoFile && hasEvolution(card)) {
      evolutions.add(cardId);
    }

    if (hasHeroUpgrade(card)) {
      heroes.add(cardId);
    }

  });

  player.evolutions?.forEach(entry => {
    const cardId = getCardId(getListedCardName(entry) || '');
    if (cardId && evoCardIds.has(cardId)) evolutions.add(cardId);
  });

  player.heroes?.forEach(entry => {
    const cardId = getCardId(getListedCardName(entry) || '');
    if (cardId && isHeroUpgradeCard(cardId)) {
      heroes.add(cardId);
    }
  });

  return {
    levels,
    evolutions: [...evolutions],
    heroes: [...heroes],
    recognizedCards: recognizedIds.size,
    usedFullCollection,
  };
};
