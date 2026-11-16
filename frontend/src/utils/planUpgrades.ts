import type { UpgradeDetail } from '../api';

export function planUpgrades(
  details: UpgradeDetail[],
  wildcards: Record<string, number>,
  goldBalance: number | null,
) {
  const remainingWildcards = { ...wildcards };
  const blocked = new Set<string>();
  let remainingGold = goldBalance;
  const steps = details.flatMap(item => (item.steps ?? []).map((step, index) => ({
    ...step, card: item.card, rarity: item.rarity, unlock: item.currentLevel === 0 && index === 0,
  }))).sort((a, b) => a.level - b.level || a.gold - b.gold || a.card.localeCompare(b.card));

  return steps.map(step => {
    if (blocked.has(step.card)) return { ...step, status: 'previous-step' } as const;
    const wild = step.unlock || !step.rarity ? 0 : remainingWildcards[step.rarity] ?? 0;
    const wildUsed = Math.min(wild, step.copies);
    const uncoveredCopies = step.copies - wildUsed;
    const missingGold = remainingGold === null ? 0 : Math.max(0, step.gold - remainingGold);
    if (uncoveredCopies || missingGold) {
      blocked.add(step.card);
      return { ...step, status: 'shortage', uncoveredCopies, missingGold } as const;
    }
    if (!step.unlock && step.rarity) remainingWildcards[step.rarity] = wild - wildUsed;
    if (remainingGold !== null) remainingGold -= step.gold;
    return { ...step, status: 'available', wildcardsUsed: wildUsed } as const;
  });
}
