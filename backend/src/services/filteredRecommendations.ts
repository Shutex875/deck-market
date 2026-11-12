import type { MetaDeck, Source } from '@prisma/client';
import { cardDataMap } from '../config/cards';

const tierScores = new Map([['S', 100], ['A', 80], ['B', 60]]);

export function scoreFilteredDeck(
  deck: MetaDeck & { source: Source },
  cards: string[],
  levels: Record<string, number>,
  evolutions: ReadonlySet<string>,
  heroes: ReadonlySet<string>,
) {
  const { id, name, tier, winRate, source } = deck;
  const slot2Type = deck.slot2Type || null;
  const [firstCard, secondCard, thirdCard] = cards;
  const firstType = evolutions.has(firstCard) ? 'evo' : 'none';
  const secondType = heroes.has(secondCard) ? 'hero' : cardDataMap[secondCard]?.champion ? 'champion' : 'none';
  const thirdType = (slot2Type !== 'hero' && evolutions.has(thirdCard))
    ? 'evo'
    : (slot2Type !== 'evo' && heroes.has(thirdCard)) ? 'hero' : 'none';
  const cardLevels = Object.fromEntries(cards.filter(card => Object.prototype.hasOwnProperty.call(levels, card))
    .map(card => [card, levels[card]]));

  return {
    id,
    name,
    cards,
    cardLevels,
    averageLevel: cards.reduce((sum, card) => sum + (levels[card] || 0), 0) / cards.length,
    missingCardsCount: cards.filter(card => !levels[card]).length,
    score: winRate ?? tierScores.get(tier ?? '') ?? 40,
    bonus: 0,
    tier,
    winRate,
    // Keep the labels used by the filtered catalog view.
    category: { name: source.name },
    source: { name: source.name },
    slot2Type,
    slotStatus: [firstType, secondType, thirdType].map((type, slot) => ({ slot, type, active: type !== 'none' })),
  };
}
