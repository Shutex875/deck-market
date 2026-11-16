const assert = require('node:assert/strict');
const { test } = require('node:test');
const { findClanWarCombinations } = require('../dist/services/clanWarCombinations');
const { planClanWarUpgrade } = require('../dist/services/clanWarUpgrade');
const { ALL_CARDS_DATA } = require('../dist/config/cards');
const { readPlayerResources } = require('../dist/services/playerResources');

test('Clan War shares wildcards and shards across four decks and rejects duplicate bases across forms', () => {
  const cores = ['Knight', 'Archers', 'Zap', 'Bats'];
  const fillers = ALL_CARDS_DATA.filter(card => !cores.includes(card.id) && !card.heroFile && !card.evoFile && !card.champion)
    .map(card => card.id);
  const decks = cores.map((card, index) => ({
    deckId: String(index), name: String(index), cards: [card, ...fillers.slice(index * 7, index * 7 + 7)],
  }));
  const levels = Object.fromEntries(decks.flatMap(deck => deck.cards).map(card => [card, cores.includes(card) ? 15 : 16]));
  const missing = readPlayerResources();
  const resources = { ...missing, gold: 480000, universalShards: 6,
    wildcards: { ...missing.wildcards, Common: 7500 } };
  const run = (pool, inventory, pinned = new Set()) =>
    planClanWarUpgrade(pool, levels, 16, pinned, new Set(), new Set(), inventory);
  const { upgradePlan } = run(decks, resources);
  assert.equal(upgradePlan.affordable, false);
  assert.equal(upgradePlan.uncoveredCopies, 22500);
  assert.equal(upgradePlan.wildcardsCovered, 7500);
  assert.equal(upgradePlan.shardDeficit, 18);
  assert.equal(upgradePlan.forms.reduce((sum, form) => sum + form.universalShards, 0), 6);
  const enough = { ...resources, universalShards: 24, wildcards: { ...resources.wildcards, Common: 30000 } };
  assert.equal(run(decks, enough).upgradePlan.affordable, true);
  const heroDeck = { ...decks[1], cards: [decks[1].cards[1], 'Knight', ...decks[1].cards.slice(2)] };
  assert.match(run([decks[0], heroDeck, ...decks.slice(2)], enough, new Set(['0', '1'])).upgradePlanBlocker,
    /одинаковые карты/);
});

test('four-deck upgrade plan keeps the pinned deck and chooses the cheapest valid fourth deck', () => {
  const cards = ALL_CARDS_DATA.slice(0, 40).map(card => card.id);
  assert.equal(cards.length, 40);
  const decks = Array.from({ length: 5 }, (_, index) => ({
    deckId: String(index), name: String(index), cards: cards.slice(index * 8, index * 8 + 8),
  }));
  const levels = Object.fromEntries(cards.slice(1, 32).map(card => [card, 15]));
  Object.assign(levels, Object.fromEntries(cards.slice(32).map(card => [card, 12])));
  const pinned = new Set(['0']);
  const required = new Set([cards[9], cards[18]]);
  const result = planClanWarUpgrade(decks, levels, 15, pinned, required, new Set());
  assert.deepEqual(result.upgradePlan.decks.map(deck => deck.deckId), ['0', '1', '2', '3']);
  assert.deepEqual(result.upgradePlan.missingCards, [cards[0]]);
  assert.ok(result.upgradePlan.uncoveredCopiesByRarity.Common > 0);
  const blocked = planClanWarUpgrade(decks, levels, 15, pinned, required, new Set([cards[0]]));
  assert.match(blocked.upgradePlanBlocker, /закреплённой.+исключённая/);
});

function exhaustivelyRank(decks, pinned, limit, minimumSize, requiredCards) {
  const cardKey = card => card === 'Log' ? 'The Log' : card;
  for (let size = Math.min(4, decks.length); size >= minimumSize; size--) {
    const matches = [];
    function enumerate(start, selected) {
      if (selected.length === size) {
        const cards = selected.flatMap(deck => deck.cards.map(cardKey));
        const unique = new Set(cards);
        if (unique.size !== cards.length ||
            [...pinned].some(id => !selected.some(deck => deck.deckId === id)) ||
            [...requiredCards].some(card => !unique.has(cardKey(card)))) return;
        const totalScore = selected.reduce((sum, deck) => sum + deck.score, 0);
        matches.push({ decks: selected, totalScore, avgScore: totalScore / size });
        return;
      }
      for (let index = start; index < decks.length; index++) {
        enumerate(index + 1, [...selected, decks[index]]);
      }
    }
    enumerate(0, []);
    if (matches.length) return matches.sort((a, b) => b.totalScore - a.totalScore).slice(0, limit);
  }
  return [];
}

test('Clan War optimized search matches exhaustive ranking on control pools', () => {
  let state = 0x708365;
  function random(max) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 2 ** 32 * max);
  }
  const cards = ['Log', 'The Log', ...Array.from({ length: 22 }, (_, index) => `card-${index}`)];
  for (let scenario = 0; scenario < 120; scenario++) {
    const decks = Array.from({ length: 5 + random(12) }, (_, index) => ({
      deckId: String(index),
      cards: Array.from({ length: 1 + random(6) }, () => cards[random(cards.length)]),
      score: scenario % 4 ? [12.1, 12.3, 13.4, 14, 15.8][random(5)] : 14,
    }));
    const pinned = new Set(scenario % 3 ? [] : [decks[random(decks.length)].deckId]);
    const requiredCards = new Set(scenario % 2 ? [] : ['Log', cards[random(cards.length)]]);
    const minimumSize = scenario % 5 ? 1 : 4;
    const limit = 1 + random(10);
    assert.deepEqual(
      findClanWarCombinations(decks, pinned, limit, minimumSize, requiredCards),
      exhaustivelyRank(decks, pinned, limit, minimumSize, requiredCards),
      `scenario ${scenario}`,
    );
  }
});
