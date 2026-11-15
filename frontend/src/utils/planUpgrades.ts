import type { UpgradeDetail } from '../api';

export function planUpgrades(
  details: (UpgradeDetail & { cardsHave: number })[],
  wildcards: Record<string, number>,
  goldBalance: number | null,
) {
  const remainingWildcards = { ...wildcards };
  const copiesByCard = new Map(details.map(item => [item.card, item.cardsHave]));
  const blocked = new Set<string>();
  let remainingGold = goldBalance;
  const steps = details.flatMap(item => (item.steps ?? []).map((step, index) => ({
    ...step, card: item.card, rarity: item.rarity, unlock: item.currentLevel === 0 && index === 0,
  }))).sort((a, b) => a.level - b.level || a.gold - b.gold || a.card.localeCompare(b.card));

  return steps.map(step => {
    if (blocked.has(step.card)) return { ...step, status: 'previous-step' } as const;
    const copies = Math.min(step.copies, copiesByCard.get(step.card) ?? 0);
    const wild = step.unlock || !step.rarity ? 0 : remainingWildcards[step.rarity] ?? 0;
    const wildUsed = Math.min(wild, step.copies - copies);
    const missingCopies = step.copies - copies - wildUsed;
    const missingGold = remainingGold === null ? 0 : Math.max(0, step.gold - remainingGold);
    if (missingCopies || missingGold) {
      blocked.add(step.card);
      return { ...step, status: 'shortage', missingCopies, missingGold } as const;
    }
    copiesByCard.set(step.card, (copiesByCard.get(step.card) ?? 0) - copies);
    if (!step.unlock && step.rarity) remainingWildcards[step.rarity] = wild - wildUsed;
    if (remainingGold !== null) remainingGold -= step.gold;
    return { ...step, status: 'available', cardCopiesUsed: copies, wildcardsUsed: wildUsed } as const;
  });
}
