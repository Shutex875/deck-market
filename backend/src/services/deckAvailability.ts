export function getDeckAvailability(cards: string[], levels: Record<string, number>) {
  const cardLevels: Record<string, number | null> = {};
  let totalLevel = 0;
  let missingCardsCount = 0;

  for (const card of cards) {
    const level = levels[card] ?? (card === 'Log' ? levels['The Log'] : card === 'The Log' ? levels.Log : undefined);
    const ownedLevel = Number.isFinite(level) && level > 0 ? level : null;
    cardLevels[card] = ownedLevel;
    if (ownedLevel === null) missingCardsCount++;
    else totalLevel += ownedLevel;
  }

  const ownedCount = cards.length - missingCardsCount;
  return {
    cardLevels,
    missingCardsCount,
    averageLevel: ownedCount ? totalLevel / ownedCount : null,
    rankingLevel: cards.length ? (totalLevel + missingCardsCount) / cards.length : 0,
  };
}
