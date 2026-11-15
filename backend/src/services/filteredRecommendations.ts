import type { Category, MetaDeck, Source } from '@prisma/client';
import { cardDataMap } from '../config/cards';
import { getDeckAvailability } from './deckAvailability';

const tierScores = new Map([['S', 100], ['A', 80], ['B', 60]]);
const kindPriority: Record<string, number> = { 'match-stats': 0, 'manual-tier': 1, 'top-ladder': 2 };

export function scoreFilteredDeck(
  deck: MetaDeck & { category: Category; source: Source },
  cards: string[],
  levels: Record<string, number>,
  evolutions: ReadonlySet<string>,
  heroes: ReadonlySet<string>,
) {
  const { id, name, tier, winRate, source } = deck;
  const { dataKind, gameMode, dataDate, sampleSize } = deck;
  const slot2Type = deck.slot2Type || null;
  const [firstCard, secondCard, thirdCard] = cards;
  const { cardLevels, averageLevel, missingCardsCount } = getDeckAvailability(cards, levels);
  const hasEvolution = (card: string) => cardLevels[card] != null && !!cardDataMap[card]?.evoFile && evolutions.has(card);
  const hasHero = (card: string) => cardLevels[card] != null && !!cardDataMap[card]?.heroFile && heroes.has(card);
  const firstType = hasEvolution(firstCard) ? 'evo' : 'none';
  const secondType = hasHero(secondCard) ? 'hero'
    : cardLevels[secondCard] != null && cardDataMap[secondCard]?.champion ? 'champion' : 'none';
  const thirdType = (slot2Type !== 'hero' && hasEvolution(thirdCard))
    ? 'evo'
    : (slot2Type !== 'evo' && hasHero(thirdCard)) ? 'hero' : 'none';

  return {
    id,
    name,
    cards,
    cardLevels,
    averageLevel,
    missingCardsCount,
    score: dataKind === 'match-stats' ? winRate ?? 0
      : dataKind === 'manual-tier' ? tierScores.get(tier ?? '') ?? 0 : 0,
    bonus: 0,
    tier,
    winRate,
    dataKind,
    gameMode,
    dataDate,
    sampleSize,
    category: deck.category,
    source: { name: source.name },
    slot2Type,
    slotStatus: [firstType, secondType, thirdType].map((type, slot) => ({ slot, type, active: type !== 'none' })),
  };
}

type ScoredMetaDeck = ReturnType<typeof scoreFilteredDeck>;

export function compareMetaRecommendations(a: ScoredMetaDeck, b: ScoredMetaDeck) {
  const byKind = (kindPriority[a.dataKind ?? ''] ?? 3) - (kindPriority[b.dataKind ?? ''] ?? 3);
  if (byKind) return byKind;
  if (a.dataKind === 'match-stats' && b.dataKind === 'match-stats') {
    const byWinRate = (b.winRate ?? -1) - (a.winRate ?? -1);
    if (byWinRate) return byWinRate;
    const bySample = (b.sampleSize ?? 0) - (a.sampleSize ?? 0);
    if (bySample) return bySample;
  }
  return b.score - a.score || (b.dataDate ?? '').localeCompare(a.dataDate ?? '');
}
