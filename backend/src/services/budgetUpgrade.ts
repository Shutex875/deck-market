import { cardDataMap } from '../config/cards';
import { calculatePlayerBonus } from './deckService';
import { readPlayerResources, summarizeUpgradeResources, type PlayerResources } from './playerResources';
import { diagnoseUpgrades } from './upgradeDiagnosis';

const evolutionCost = 6;
const heroCost = 200;
interface RequiredForm {
  card: string;
  type: 'evolution' | 'hero';
  unlocked: boolean;
  specificShards: number;
  universalShards: number;
  missingShards: number;
  heroCoins: number;
}

export type UpgradeCandidate = { id: string; name: string; cards: string; slot2Type: string | null };
export type UpgradeProfile = { levels: string; evolutions: string; heroes: string; resources?: string | null };

export function evaluateBudgetDecks(
  decks: UpgradeCandidate[],
  player: UpgradeProfile,
  targetLevel: number,
) {
  const levels: Record<string, number> = JSON.parse(player.levels);
  const evolutions: string[] = JSON.parse(player.evolutions);
  const heroes: string[] = JSON.parse(player.heroes);
  const resources = readPlayerResources(player.resources);
  const verified = Boolean(player.resources);
  return decks.flatMap(deck => {
    const cards: string[] = JSON.parse(deck.cards).map((card: string) => card === 'Log' ? 'The Log' : card);
    if (cards.length !== 8 || new Set(cards).size !== 8) return [];
    const { details, totalGold } = diagnoseUpgrades(cards, levels, targetLevel, true);
    if (details.some(card => !card.rarity)) return [];

    const forms = getRequiredForms(cards, deck.slot2Type, evolutions, heroes, resources);
    const neededForms = forms.filter(form => !form.unlocked);
    const deficit = summarizeUpgradeResources(details, totalGold, resources);
    const shardDeficit = neededForms.reduce((sum, form) => sum + form.missingShards, 0);
    const heroCoinDeficit = Math.max(0, neededForms.filter(form => form.type === 'hero').length * heroCost - resources.heroCoins);
    const missingData = [];
    if (!verified && totalGold) missingData.push('баланс золота');
    if (!verified && deficit.uncoveredCopies) missingData.push('джокеры по редкостям');
    if (!verified && neededForms.some(form => form.type === 'evolution')) missingData.push('универсальные осколки');
    if (!verified && heroCoinDeficit) missingData.push('монеты героя');
    const unknownShards = neededForms.filter(form => shardDeficit > 0 && form.type === 'evolution' &&
      !Object.prototype.hasOwnProperty.call(resources.evolutionShards, form.card));
    if (unknownShards.length) missingData.push(`осколки эволюций: ${unknownShards.map(form => form.card).join(', ')}`);

    const currentBonus = calculatePlayerBonus(cards, deck.slot2Type, levels, evolutions, heroes).bonus;
    const goalLevels = Object.fromEntries(details.map(card => [
      card.card, card.steps[card.steps.length - 1]?.level ?? card.currentLevel,
    ]));
    const goalBonus = calculatePlayerBonus(cards, deck.slot2Type, goalLevels,
      [...evolutions, ...forms.filter(form => form.type === 'evolution').map(form => form.card)],
      [...heroes, ...forms.filter(form => form.type === 'hero').map(form => form.card)]).bonus;
    const ready = details.every(card => card.currentLevel > 0) && !neededForms.length;
    const hasWork = details.some(card => card.steps.length) || neededForms.length > 0;
    return [{
      id: deck.id, name: deck.name, cards, details, totalGold, forms, ...deficit, shardDeficit, heroCoinDeficit, missingData,
      ready, hasWork,
      fits: hasWork && !(deficit.goldDeficit || deficit.uncoveredCopies || shardDeficit || heroCoinDeficit || missingData.length),
      currentScore: details.reduce((sum, card) => sum + card.currentLevel, 0) / 8 + currentBonus,
      projectedScore: Object.values(goalLevels).reduce((sum, level) => sum + level, 0) / 8 + goalBonus,
    }];
  });
}

export function rankBudgetDecks(decks: UpgradeCandidate[], player: UpgradeProfile, targetLevel: number) {
  const candidates = evaluateBudgetDecks(decks, player, targetLevel);
  const ready = [...candidates].sort((a, b) => b.currentScore - a.currentScore).find(deck => deck.ready);
  candidates.sort((a, b) => b.projectedScore - a.projectedScore || a.totalGold - b.totalGold);
  const affordable = candidates.find(deck => deck.fits);
  const prospective = candidates.find(deck => deck.hasWork && !deck.fits);
  return { ready: ready ?? null, affordable: affordable ?? null, prospective: prospective ?? null };
}

export function getRequiredForms(
  cards: string[], slot2Type: string | null, evolutions: string[], heroes: string[], resources: PlayerResources,
) {
  let wildShards = resources.universalShards;
  return cards.slice(0, 3).flatMap<RequiredForm>((card, slot) => {
    const data = cardDataMap[card];
    if (data?.evoFile && (slot === 0 || slot === 2 && slot2Type === 'evo')) {
      const unlocked = evolutions.includes(card);
      const specificShards = unlocked ? 0 : Math.min(evolutionCost, resources.evolutionShards[card] ?? 0);
      const requiredShards = unlocked ? 0 : evolutionCost - specificShards;
      const universalShards = Math.min(wildShards, requiredShards);
      wildShards -= universalShards;
      return [{ card, type: 'evolution' as const, unlocked, specificShards, universalShards,
        missingShards: requiredShards - universalShards, heroCoins: 0 }];
    }
    if (data?.heroFile && !data.champion && (slot === 1 || slot === 2 && slot2Type === 'hero')) {
      const unlocked = heroes.includes(card);
      return [{ card, type: 'hero' as const, unlocked, specificShards: 0, universalShards: 0,
        missingShards: 0, heroCoins: unlocked ? 0 : heroCost }];
    }
    return [];
  });
}
