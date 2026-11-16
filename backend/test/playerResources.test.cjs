const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createPlayersRouter } = require('../dist/routes/players');
const { createRecommendationsRouter } = require('../dist/routes/recommendations');
const { readPlayerResources } = require('../dist/services/playerResources');

async function request(router, path, method, ownerId, body, id) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  const res = {
    locals: { user: { id: ownerId } }, code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
  await route.stack[0].handle({ params: { id }, body }, res);
  return res;
}

test('resource writes and upgrade estimates stay isolated between owned profiles', async () => {
  const cards = ['Knight', 'Archers', 'Skeleton', 'Ice Spirit', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const levels = JSON.stringify(Object.fromEntries(cards.map(card => [card, card === 'Knight' ? 15 : 16])));
  const profiles = ['first', 'second'].map(id => ({
    id, name: id, ownerId: 'owner', levels, evolutions: '[]', heroes: '[]', resources: null,
  }));
  const find = where => profiles.find(profile => Object.entries(where).every(([key, value]) => profile[key] === value));
  const prisma = {
    player: {
      findFirst: async ({ where }) => find(where),
      findUnique: async ({ where }) => find(where.ownerId_name),
      updateMany: async ({ where, data }) => {
        const profile = find(where);
        if (!profile) return { count: 0 };
        Object.assign(profile, data);
        return { count: 1 };
      },
    },
    metaDeck: { findMany: async () => [{ id: 'deck', name: 'Deck', cards: JSON.stringify(cards) }] },
  };
  const players = createPlayersRouter(prisma);
  const resources = (method, id, body, owner = 'owner') =>
    request(players, '/players/:id/resources', method, owner, body, id);
  const empty = readPlayerResources();
  const stocked = {
    ...empty, gold: 120000, wildcards: { ...empty.wildcards, Common: 7500 },
    evolutionShards: { Knight: 0 }, heroCoins: 10,
  };
  profiles[1].resources = JSON.stringify({ ...empty, cardCopies: { Knight: 7500 } });
  assert.equal((await resources('put', 'first', stocked)).code, 200);
  assert.deepEqual((await resources('get', 'first')).body, stocked);
  assert.deepEqual((await resources('get', 'second')).body, empty);
  assert.equal((await resources('get', 'first', undefined, 'other')).code, 404);
  assert.equal((await resources('put', 'first', empty, 'other')).code, 404);
  assert.equal((await resources('put', 'first', { ...empty, gold: -1 })).code, 400);
  const recommend = playerName => request(createRecommendationsRouter(prisma), '/recommend', 'post', 'owner', {
    playerName, mode: 'prospective', targetLevel: 16,
  });
  const before = profiles.map(profile => profile.resources);
  const first = (await recommend('first')).body.decks[0].upgrade;
  const second = (await recommend('second')).body.decks[0].upgrade;
  assert.deepEqual([first.totalGold, first.goldDeficit, first.wildcardsCovered, first.uncoveredCopies], [120000, 0, 7500, 0]);
  assert.deepEqual([second.totalGold, second.goldDeficit, second.wildcardsCovered, second.uncoveredCopies], [120000, 120000, 0, 7500]);
  assert.deepEqual(profiles.map(profile => profile.resources), before);
  assert.equal((await resources('put', 'second', empty)).code, 200);
  assert.deepEqual(JSON.parse(profiles[1].resources), empty);
  assert.deepEqual(JSON.parse(profiles[0].resources), stocked);
});
