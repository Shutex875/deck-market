import { z } from 'zod';
import { cardDataMap } from '../config/cards';
import type { diagnoseUpgrades } from './upgradeDiagnosis';

const amount = z.number().int().min(0).max(2147483647);
const cardAmounts = z.record(z.string(), amount);
const wildcards = z.object({
  Common: amount, Rare: amount, Epic: amount, Legendary: amount, Champion: amount,
}).strict();

export const playerResourcesSchema = z.object({
  gold: amount,
  wildcards,
  universalShards: amount,
  evolutionShards: cardAmounts.refine(cards => Object.keys(cards).every(id => cardDataMap[id]?.evoFile)),
  heroCoins: amount,
}).strict();

export type PlayerResources = z.infer<typeof playerResourcesSchema>;

const emptyResources: PlayerResources = {
  gold: 0, wildcards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
  universalShards: 0, evolutionShards: {}, heroCoins: 0,
};

const storedResourcesSchema = playerResourcesSchema.strip();

export function readPlayerResources(value?: string | null): PlayerResources {
  return value ? storedResourcesSchema.parse(JSON.parse(value)) : emptyResources;
}

export function summarizeUpgradeResources(
  details: ReturnType<typeof diagnoseUpgrades>['details'],
  totalGold: number,
  resources: PlayerResources,
) {
  const uncoveredCopiesByRarity: Record<string, number> = {};
  const unlockCopiesByRarity: Record<string, number> = {};
  let neededCopies = 0;
  let wildcardsCovered = 0;
  for (const { rarity, currentLevel, neededCards, steps } of details) {
    if (!rarity || !neededCards) continue;
    neededCopies += neededCards;
    uncoveredCopiesByRarity[rarity] = (uncoveredCopiesByRarity[rarity] ?? 0) + neededCards;
    if (!currentLevel && steps[0]) {
      unlockCopiesByRarity[rarity] = (unlockCopiesByRarity[rarity] ?? 0) + steps[0].copies;
    }
  }
  for (const rarity of Object.keys(resources.wildcards) as (keyof PlayerResources['wildcards'])[]) {
    const required = uncoveredCopiesByRarity[rarity];
    if (required === undefined) continue;
    const covered = Math.min(required - (unlockCopiesByRarity[rarity] ?? 0), resources.wildcards[rarity]);
    wildcardsCovered += covered;
    uncoveredCopiesByRarity[rarity] = required - covered;
  }
  return {
    goldDeficit: Math.max(0, totalGold - resources.gold),
    neededCopies,
    wildcardsCovered,
    uncoveredCopies: neededCopies - wildcardsCovered,
    uncoveredCopiesByRarity,
  };
}
