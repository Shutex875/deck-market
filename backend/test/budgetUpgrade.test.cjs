const assert = require('node:assert/strict');
const { test } = require('node:test');
const { rankBudgetDecks } = require('../dist/services/budgetUpgrade');
const { readPlayerResources } = require('../dist/services/playerResources');

test('budget planning separates playable decks, funded upgrades, and unresolved shortages', () => {
  const cards = ['Fireball', 'Cannon', 'Hog Rider', 'Valkyrie', 'Archers', 'Knight', 'Skeleton', 'The Log'];
  const cardsWithForms = ['Knight', 'Valkyrie', 'Archers', 'Fireball', 'Cannon', 'Hog Rider', 'Skeleton', 'The Log'];
  const decks = [
    { id: 'ready', name: 'Ready', cards: JSON.stringify(cards), slot2Type: null },
    { id: 'forms', name: 'Forms', cards: JSON.stringify(cardsWithForms), slot2Type: 'evo' },
  ];
  const levels = Object.fromEntries(cards.map(card => [card, card === 'Knight' ? 15 : 16]));
  const profile = {
    levels: JSON.stringify(levels),
    evolutions: '[]', heroes: '[]',
  };
  const resources = {
    ...readPlayerResources(), gold: 120000,
    wildcards: { ...readPlayerResources().wildcards, Common: 7500 },
    universalShards: 6, evolutionShards: { Knight: 2, Archers: 0 }, heroCoins: 0,
  };
  const result = rankBudgetDecks(decks, { ...profile, resources: JSON.stringify(resources) }, 16);
  assert.equal(result.ready.id, 'ready');
  assert.equal(result.affordable.id, 'ready');
  assert.equal(result.affordable.totalGold, 120000);
  assert.equal(result.affordable.uncoveredCopies, 0);
  assert.equal(result.prospective.id, 'forms');
  assert.equal(result.prospective.shardDeficit, 4);
  assert.equal(result.prospective.heroCoinDeficit, 200);
  assert.equal(result.prospective.missingData.length, 0);

  const unknown = rankBudgetDecks(decks, profile, 16);
  assert.equal(unknown.affordable, null);
  assert.ok(unknown.prospective.missingData.includes('баланс золота'));
  assert.ok(unknown.prospective.missingData.includes('джокеры по редкостям'));

  delete levels.Knight;
  const locked = rankBudgetDecks(decks.slice(0, 1), {
    ...profile, levels: JSON.stringify(levels), resources: JSON.stringify({
      ...resources, gold: 1000000, wildcards: { ...resources.wildcards, Common: 100000 },
    }),
  }, 16);
  assert.equal(locked.affordable, null);
  assert.equal(locked.prospective.uncoveredCopies, 1);
});
