const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRecommendationsRouter } = require('../dist/routes/recommendations');
const { createMetaDecksRouter } = require('../dist/routes/metaDecks');
const { findClanWarCombinations } = require('../dist/services/clanWarCombinations');

function request(path, body, prisma, createRouter = createRecommendationsRouter) {
  const router = createRouter(prisma);
  const route = router.stack.find(layer => layer.route?.path === path).route;
  const response = { statusCode: 200 };
  const res = {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(data) {
      response.body = data;
      return this;
    },
  };
  return Promise.resolve(route.stack[0].handle({ body }, res)).then(() => response);
}

test('recommendation routes reject malformed input before querying Prisma', async () => {
  const cases = [
    [undefined, 'Player name is required'],
    [[], 'Request body must be an object'],
    [{ playerName: 12 }, 'Player name is required'],
    [{ playerName: '   ' }, 'Player name is required'],
    [{ playerName: 'Player', limit: {} }, 'Limit must be a number or string'],
    [{ playerName: 'Player', includeCards: 'Knight' }, 'Card filters must be arrays of card IDs'],
    [{ playerName: 'Player', excludeCards: [5] }, 'Card filters must be arrays of card IDs'],
  ];
  for (const path of ['/recommend', '/recommend-cw']) {
    for (const [body, error] of cases) {
      assert.deepEqual(await request(path, body, {}), { statusCode: 400, body: { error } });
    }
  }
  for (const requiredDeckIds of ['deck-1', [3]]) {
    const result = await request('/recommend-cw', { playerName: 'Player', requiredDeckIds }, {});
    assert.deepEqual(result, {
      statusCode: 400,
      body: { error: 'Required decks must be an array of deck IDs' },
    });
  }
});

test('regular recommendations preserve limit defaults, numeric strings and bounds', async () => {
  const cards = ['Knight', 'Archers', 'Skeleton', 'Ice Spirit', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const player = {
    levels: JSON.stringify(Object.fromEntries(cards.map(card => [card, 14]))),
    evolutions: '[]',
    heroes: '[]',
  };
  const prisma = {
    player: { findUnique: async () => player },
    metaDeck: {
      findMany: async () => Array.from({ length: 105 }, (_, id) => ({
        id: String(id), cards: JSON.stringify(cards), slot2Type: null,
      })),
    },
  };
  for (const [limit, expected] of [[undefined, 10], ['invalid', 10], ['2.9', 2], [0, 1], [101, 100]]) {
    const result = await request('/recommend', { playerName: 'Player', limit }, prisma);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.decks.length, expected);
    assert.equal(result.body.totalDecks, 105);
  }
});

test('Clan War accepts card filters and required deck IDs with the exact account name', async () => {
  const result = await request('/recommend-cw', {
    playerName: ' Player ',
    limit: '5',
    includeCards: ['Knight'],
    excludeCards: ['Ice Spirit'],
    requiredDeckIds: ['deck-1'],
  }, {
    player: {
      findUnique: async ({ where }) => {
        assert.equal(where.name, ' Player ');
        return null;
      },
    },
  });
  assert.deepEqual(result, { statusCode: 404, body: { error: 'Player not found' } });
});

test('Clan War prioritizes larger groups and preserves tie order within the limit', () => {
  const decks = ['A', 'B', 'C', 'D', 'E'].map(deckId => ({
    deckId, cards: [deckId], score: 1,
  }));
  decks.push(
    { deckId: 'F', cards: ['A', 'B', 'C', 'D'], score: 99 },
    { deckId: 'G', cards: ['G', 'G'], score: 100 },
  );
  const combinations = findClanWarCombinations(decks, new Set(['D']), 2);
  assert.deepEqual(combinations.map(group => group.decks.map(deck => deck.deckId)), [
    ['A', 'B', 'C', 'D'],
    ['A', 'B', 'D', 'E'],
  ]);
  assert.ok(combinations.every(group => group.totalScore === 4 && group.avgScore === 1));
  const fallback = findClanWarCombinations(decks, new Set(['F']), 2);
  assert.deepEqual(fallback.map(group => group.decks.map(deck => deck.deckId)), [['E', 'F']]);
  assert.deepEqual(findClanWarCombinations(decks, new Set(['A', 'F']), 2), []);
});

test('filtered recommendations use catalog scoring before applying the requested limit', async () => {
  const source = { name: 'Catalog source' };
  const row = (id, cards, fields = {}) => ({
    id, name: id, cards: JSON.stringify(cards), tier: 'A', winRate: null,
    source, slot2Type: null, isActive: false, ...fields,
  });
  const rows = [
    row('a', ['Knight', 'Ice Spirit'], { winRate: 100 }),
    row('b', ['Knight', 'Archers']),
    row('c', ['Knight', 'Skeleton']),
    row('d', ['Archers', 'Skeleton'], { tier: 'S' }),
  ];
  const result = await request('/recommend', {
    playerName: 'Player', includeCards: ['Knight'], excludeCards: ['Ice Spirit'], limit: 1,
  }, {
    player: { findUnique: async () => ({ levels: '{}', evolutions: '[]', heroes: '[]' }) },
    metaDeck: {
      findMany: async query => {
        assert.deepEqual(query.orderBy, { name: 'asc' });
        assert.equal(query.where, undefined);
        return rows;
      },
    },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.totalDecks, 2);
  assert.deepEqual(result.body.decks.map(({ id, cards, score, bonus }) => ({ id, cards, score, bonus })), [
    { id: 'b', cards: ['Knight', 'Archers'], score: 80, bonus: 0 },
  ]);
});

test('duplicate check matches compositions across both catalogs with two database reads', async () => {
  const cards = ['Knight', 'Archers', 'Skeleton', 'Ice Spirit', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const path = '/meta-decks/check-duplicates';
  const queries = [];
  const prisma = {
    metaDeck: {
      findMany: async query => {
        queries.push(query);
        return [
          { name: 'Meta', cards: JSON.stringify(cards) },
          { name: 'Malformed', cards: '[' },
        ];
      },
    },
    savedDeck: {
      findMany: async query => {
        queries.push(query);
        return [
          { name: 'Meta', cards: JSON.stringify(cards) },
          { name: 'Saved', cards: JSON.stringify([...cards].reverse()) },
          { name: 'Different', cards: JSON.stringify([...cards.slice(1), 'Goblins']) },
        ];
      },
    },
  };
  const invalid = await request(path, { cards: Array(8).fill('Knight') }, prisma, createMetaDecksRouter);
  assert.equal(invalid.statusCode, 400);
  assert.equal(queries.length, 0);
  const result = await request(path, { cards: [...cards].reverse() }, prisma, createMetaDecksRouter);
  assert.deepEqual(result, { statusCode: 200, body: { names: ['Meta', 'Saved'] } });
  assert.deepEqual(queries.map(query => query.select), [{ cards: true, name: true }, { cards: true, name: true }]);
});
