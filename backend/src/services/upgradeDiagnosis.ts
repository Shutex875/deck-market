import { cardDataMap } from '../config/cards';
import { getDeckAvailability } from './deckAvailability';

const rarities = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'] as const;
type Rarity = typeof rarities[number];

// Each row is the cost to reach that level from the previous one.
// Copies are ordered by rarities above. The first copy unlocks the card.
// https://supercell.com/en/games/clashroyale/blog/news/coming-in-the-next-update/
const upgrades: Record<number, {
  gold: number;
  copies: readonly [number, number, number, number, number];
  goldOverride?: Partial<Record<Rarity, number>>;
}> = {
  1: { gold: 0, copies: [1, 0, 0, 0, 0] },
  2: { gold: 5, copies: [2, 0, 0, 0, 0] },
  3: { gold: 20, copies: [4, 1, 0, 0, 0] },
  4: { gold: 50, copies: [10, 2, 0, 0, 0] },
  5: { gold: 150, copies: [20, 4, 0, 0, 0] },
  6: { gold: 400, copies: [50, 10, 1, 0, 0] },
  7: { gold: 1000, copies: [100, 20, 2, 0, 0], goldOverride: { Epic: 400 } },
  8: { gold: 2000, copies: [200, 50, 4, 0, 0] },
  9: { gold: 4000, copies: [400, 100, 10, 1, 0] },
  10: { gold: 8000, copies: [800, 200, 20, 2, 0], goldOverride: { Legendary: 5000 } },
  11: { gold: 15000, copies: [1000, 300, 30, 4, 1] },
  12: { gold: 25000, copies: [1500, 400, 50, 6, 2] },
  13: { gold: 40000, copies: [2500, 550, 70, 9, 5] },
  14: { gold: 60000, copies: [3500, 750, 100, 12, 8] },
  15: { gold: 90000, copies: [5500, 1000, 130, 14, 11] },
  16: { gold: 120000, copies: [7500, 1400, 180, 20, 15] },
};

export const MAX_UPGRADE_LEVEL = 16;

export function isUpgradeTarget(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_UPGRADE_LEVEL;
}

export function diagnoseUpgrades(cards: string[], levels: Record<string, number>, targetLevel: number, includeUnlocks = false) {
  const { cardLevels } = getDeckAvailability(cards, levels);
  const details = cards.map(card => {
    const currentLevel = cardLevels[card] ?? 0;
    const cardRarity = cardDataMap[card === 'Log' ? 'The Log' : card]?.rarity;
    const rarityIndex = rarities.findIndex(rarity => rarity === cardRarity);
    const rarity = rarities[rarityIndex] ?? null;
    let neededGold = 0;
    let neededCards = 0;
    const steps: { level: number; gold: number; copies: number }[] = [];
    if (rarity) {
      const goal = includeUnlocks && currentLevel === 0
        ? Math.max(targetLevel, [1, 3, 6, 9, 11][rarityIndex]) : targetLevel;
      for (let level = Math.floor(currentLevel) + 1; level <= goal; level++) {
        const upgrade = upgrades[level];
        const copies = upgrade.copies[rarityIndex];
        if (copies === 0) continue;
        const gold = copies === 1 ? 0 : upgrade.goldOverride?.[rarity] ?? upgrade.gold;
        steps.push({ level, gold, copies });
        neededCards += copies;
        neededGold += gold;
      }
    }
    return { card, rarity, currentLevel, neededGold, neededCards, steps };
  });
  return { details, totalGold: details.reduce((sum, card) => sum + card.neededGold, 0) };
}
