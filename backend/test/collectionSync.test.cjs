const assert = require('node:assert/strict');
const { test } = require('node:test');
const axios = require('axios');
const { checkCollection, readCollectionPreview } = require('../dist/services/collectionSync');
const { createPlayersRouter } = require('../dist/routes/players');

test('a partial collection check stages changes and applies them only with the matching preview ID', async t => {
  const player = {
    id: 'profile', ownerId: 'owner', tag: '#P0Y',
    levels: '{"Knight":12,"Fireball":15}', evolutions: '[]', heroes: '["Archer Queen"]',
    collectionCheckedAt: null, collectionCheckAttemptAt: null, collectionPreview: null,
  };
  const token = process.env.CLASH_ROYALE_API_TOKEN;
  process.env.CLASH_ROYALE_API_TOKEN = 'test-token';
  t.after(() => {
    if (token === undefined) delete process.env.CLASH_ROYALE_API_TOKEN;
    else process.env.CLASH_ROYALE_API_TOKEN = token;
  });
  t.mock.method(axios, 'get', async () => ({ data: {
    currentDeck: [{ name: 'Knight', level: 14, maxLevel: 16, evolutionLevel: 1 }],
  } }));
  const matches = where => Object.entries(where).every(([key, value]) => player[key] === value);
  const prisma = { player: {
    findFirst: async ({ where }) => matches(where) ? { ...player } : null,
    updateMany: async ({ where, data }) => {
      if (!matches(where)) return { count: 0 };
      Object.assign(player, data);
      return { count: 1 };
    },
  } };
  await checkCollection(prisma, { ...player });
  assert.deepEqual(JSON.parse(player.levels), { Knight: 12, Fireball: 15 });
  assert.ok(player.collectionCheckedAt instanceof Date);
  const preview = readCollectionPreview(player);
  assert.equal(preview.partial, true);
  assert.deepEqual(preview.levels, [{ card: 'Knight', from: 12, to: 14 }]);
  assert.deepEqual(preview.evolutions, ['Knight']);

  const route = createPlayersRouter(prisma).stack.find(layer =>
    layer.route?.path === '/players/:id/collection/apply').route;
  const apply = async (previewId, owner = 'owner') => {
    const res = { locals: { user: { id: owner } }, code: 200, status(code) { this.code = code; return this; }, json() {} };
    await route.stack[0].handle({ params: { id: player.id }, body: { previewId } }, res);
    return res.code;
  };
  assert.equal(await apply(preview.id, 'other'), 404);
  assert.equal(await apply('stale'), 409);
  assert.equal(await apply(preview.id), 200);
  assert.deepEqual(JSON.parse(player.levels), { Knight: 14, Fireball: 15 });
  assert.deepEqual(JSON.parse(player.heroes), ['Archer Queen']);
  assert.deepEqual(JSON.parse(player.evolutions), ['Knight']);
  assert.equal(readCollectionPreview(player), null);
});
