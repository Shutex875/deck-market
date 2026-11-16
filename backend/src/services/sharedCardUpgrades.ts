import { evaluateBudgetDecks, type UpgradeCandidate, type UpgradeProfile } from './budgetUpgrade';
import { readPlayerResources } from './playerResources';
import { diagnoseUpgrades } from './upgradeDiagnosis';

export type SharedCardPriority = 'target' | 'budget';

export function rankSharedCardUpgrades(
  decks: UpgradeCandidate[], profile: UpgradeProfile, targetLevel: number, priority: SharedCardPriority,
) {
  const candidates = evaluateBudgetDecks(decks, profile, targetLevel);
  const candidatesById = new Map(decks.map(deck => [deck.id, deck]));
  const levels: Record<string, number> = JSON.parse(profile.levels);
  const resources = readPlayerResources(profile.resources);
  const affectedByCard = new Map<string, typeof candidates>();
  for (const deck of candidates) {
    for (const card of deck.details) {
      if (!card.currentLevel || card.currentLevel >= targetLevel) continue;
      const affected = affectedByCard.get(card.card) ?? [];
      if (!affectedByCard.has(card.card)) affectedByCard.set(card.card, affected);
      affected.push(deck);
    }
  }

  const upgrades = [...affectedByCard].flatMap(([card, before]) => {
    const fromLevel = levels[card] ?? (card === 'The Log' ? levels.Log : undefined);
    if (!fromLevel) return [];
    const toLevel = fromLevel + 1;
    const { details: [cost], totalGold } = diagnoseUpgrades([card], levels, toLevel);
    if (!cost.rarity) return [];
    const rarity = cost.rarity as keyof typeof resources.wildcards;
    const wildcardsUsed = Math.min(resources.wildcards[rarity], cost.neededCards);
    const missingGold = Math.max(0, totalGold - resources.gold);
    const uncoveredCopies = cost.neededCards - wildcardsUsed;
    const needsInput = [];
    if (!profile.resources && totalGold) needsInput.push('баланс золота');
    if (!profile.resources && uncoveredCopies) needsInput.push('джокеры');
    const affordable = !missingGold && !uncoveredCopies && !needsInput.length;
    const remainingResources = {
      ...resources,
      gold: Math.max(0, resources.gold - totalGold),
      wildcards: { ...resources.wildcards, [rarity]: resources.wildcards[rarity] - wildcardsUsed },
    };
    const after = evaluateBudgetDecks(before.map(deck => candidatesById.get(deck.id)!), {
      ...profile,
      levels: JSON.stringify({ ...levels, [card]: toLevel }),
      resources: profile.resources ? JSON.stringify(remainingResources) : null,
    }, targetLevel);
    const reached = [];
    const oneCardLeft = [];
    const withinBudget = [];
    const closer = [];
    let progress = 0;
    const nearBefore = new Set(before.filter(deck => deck.details.filter(detail => detail.steps.length).length === 1)
      .map(deck => deck.id));
    for (const deck of after) {
      const summary = { id: deck.id, name: deck.name };
      const remaining = deck.details.filter(detail => detail.steps.length);
      const remainingSteps = remaining.reduce((sum, detail) => sum + detail.steps.length, 0) +
        deck.forms.filter(form => !form.unlocked).length;
      progress += 1 / (1 + remainingSteps);
      if (!deck.hasWork) reached.push(summary);
      else if (remaining.length === 1 && !nearBefore.has(deck.id) && deck.forms.every(form => form.unlocked)) {
        oneCardLeft.push({ ...summary, card: remaining[0].card, level: remaining[0].currentLevel });
      }
      if (affordable && deck.fits) withinBudget.push({ ...summary, gold: deck.totalGold });
      if (remainingSteps) closer.push({ ...summary, remainingSteps });
    }
    return [{
      card, fromLevel, toLevel, gold: totalGold, copies: cost.neededCards, wildcardsUsed,
      missingGold, uncoveredCopies, needsInput, affordable, reached, oneCardLeft, withinBudget,
      closer: closer.sort((a, b) => a.remainingSteps - b.remainingSteps), progress,
    }];
  });

  return upgrades.sort((a, b) => {
    const byBudget = Number(b.affordable) - Number(a.affordable);
    const byReach = b.reached.length - a.reached.length;
    const byNear = b.oneCardLeft.length - a.oneCardLeft.length;
    const byFundedDecks = b.reached.length + b.withinBudget.length - a.reached.length - a.withinBudget.length;
    return (priority === 'budget' ? byBudget || byFundedDecks || byReach || byNear : byReach || byNear || byBudget)
      || b.progress - a.progress || a.gold - b.gold || a.card.localeCompare(b.card);
  });
}
