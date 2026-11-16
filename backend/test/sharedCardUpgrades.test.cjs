const assert = require('node:assert/strict');
const { test } = require('node:test');
const { rankSharedCardUpgrades } = require('../dist/services/sharedCardUpgrades');
const { readPlayerResources } = require('../dist/services/playerResources');

test('shared upgrades count new target decks and consider the budget left after spending', () => {
  const core = ['Fireball', 'Cannon', 'Hog Rider', 'Knight', 'Archers', 'Skeleton', 'Ice Spirit'];
  const deck = (id, cards) => ({ id, name: id, cards: JSON.stringify(cards), slot2Type: null });
  const decks = [
    deck('first', [...core, 'Arrows']),
    deck('second', [...core.slice(0, 6), 'The Log', 'Arrows']),
    deck('needs-two', [...core.slice(0, 6), 'Arrows', 'Musketeer']),
    deck('musketeer-only', [...core, 'Musketeer']),
  ];
  const levels = Object.fromEntries([...core, 'The Log'].map(card => [card, 16]));
  Object.assign(levels, { Arrows: 15, Musketeer: 15 });
  const empty = readPlayerResources();
  const resources = {
    ...empty, gold: 120000, wildcards: { ...empty.wildcards, Rare: 1400 },
  };
  const profile = { levels: JSON.stringify(levels), evolutions: '[]', heroes: '[]' };
  const targetResult = rankSharedCardUpgrades(decks, { ...profile, resources: JSON.stringify(resources) }, 16, 'target');
  assert.equal(targetResult[0].card, 'Arrows');
  assert.equal(targetResult[0].affordable, false);
  assert.equal(targetResult[0].uncoveredCopies, 7500);
  assert.deepEqual(targetResult[0].reached.map(deck => deck.id), ['first', 'second']);
  assert.deepEqual(targetResult[0].oneCardLeft, [{ id: 'needs-two', name: 'needs-two', card: 'Musketeer', level: 15 }]);
  const budgetResult = rankSharedCardUpgrades(decks, { ...profile, resources: JSON.stringify(resources) }, 16, 'budget');
  assert.equal(budgetResult[0].card, 'Musketeer');
  assert.equal(budgetResult[0].affordable, true);

  resources.wildcards.Common = 7500;
  const step = gold => rankSharedCardUpgrades(decks, {
    ...profile, resources: JSON.stringify({ ...resources, gold }),
  }, 16, 'budget').find(step => step.card === 'Arrows');
  assert.deepEqual(step(120000).withinBudget, []);
  assert.deepEqual(step(240000).withinBudget.map(deck => deck.id), ['needs-two']);
});
