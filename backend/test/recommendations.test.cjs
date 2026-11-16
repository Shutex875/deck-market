const assert = require('node:assert/strict');
const { test } = require('node:test');
const axios = require('axios');
const { createRecommendationsRouter } = require('../dist/routes/recommendations');
const { createMetaDecksRouter } = require('../dist/routes/metaDecks');
const { createPlayersRouter } = require('../dist/routes/players');
const { findClanWarCombinations } = require('../dist/services/clanWarCombinations');
const { parseTopLadderDeck } = require('../dist/services/topLadderParser');

function request(path, body, prisma, createRouter = createRecommendationsRouter, options = {}) {
  const router = createRouter(prisma);
  const route = router.stack.find(layer => layer.route?.path === path &&
    (!options.method || layer.route.methods[options.method])).route;
  const response = { statusCode: 200 };
  const res = {
    on() {},
    off() {},
    locals: { user: { id: 'user-a', username: 'catalog-admin', canManageCatalog: options.canManageCatalog ?? true } },
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(data) {
      response.body = data;
      return this;
    },
  };
  const req = { body, on() {}, off() {}, ...options };
  async function run(index) {
    let next;
    await route.stack[index].handle(req, res, () => { next = run(index + 1); });
    await next;
  }
  return run(0).then(() => response);
}

test('catalog writes reject regular users before accessing the database', async () => {
  const routes = createMetaDecksRouter({}).stack.flatMap(({ route }) =>
    ['post', 'put', 'delete'].filter(method => route?.methods[method] &&
      route.path !== '/meta-decks/check-duplicates').map(method => [route.path, method]),
  );
  assert.ok(routes.length > 0);
  for (const [path, method] of routes) {
    const result = await request(path, {}, {}, createMetaDecksRouter, { canManageCatalog: false, method });
    assert.equal(result.statusCode, 403, path);
  }
});

test('saved deck deletion requires a matching account', async () => {
  const deletes = [];
  const prisma = {
    savedDeck: {
      async deleteMany({ where }) {
        deletes.push(where);
        return { count: Number(where.id === 'deck-a' && where.player.name === 'Account A') };
      },
    },
  };
  const remove = playerName => request('/saved-decks/:id', undefined, prisma, createRecommendationsRouter, {
    params: { id: 'deck-a' }, query: { playerName },
  });
  assert.equal((await remove()).statusCode, 400);
  assert.equal(deletes.length, 0);
  assert.equal((await remove('Account B')).statusCode, 404);
  assert.deepEqual(await remove('Account A'), { statusCode: 200, body: { success: true } });
  assert.deepEqual(deletes, [
    { id: 'deck-a', player: { name: 'Account B', ownerId: 'user-a' } },
    { id: 'deck-a', player: { name: 'Account A', ownerId: 'user-a' } },
  ]);
});

test('saved deck transfer copies or moves only between owned profiles and rejects duplicate compositions', async () => {
  const cards = ['Knight', 'Archers', 'Skeleton', 'Ice Spirit', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const source = { id: 'saved-a', playerId: 'profile-a', name: 'Favorite', cards: JSON.stringify(cards) };
  const rows = [source];
  const prisma = {
    $transaction: callback => callback({
      player: {
        async findUnique({ where }) {
          assert.equal(where.ownerId_name.ownerId, 'user-a');
          return { B: { id: 'profile-b' }, C: { id: 'profile-c' } }[where.ownerId_name.name] ?? null;
        },
      },
      savedDeck: {
        async findFirst({ where }) {
          assert.deepEqual(where.player, { name: 'A', ownerId: 'user-a' });
          return rows.find(row => row.id === where.id && row.playerId === 'profile-a') ?? null;
        },
        async findMany({ where }) {
          return rows.filter(row => row.playerId === where.playerId);
        },
        async create({ data }) {
          const row = { ...data, id: 'copy-id' };
          rows.push(row);
          return row;
        },
        async update({ where, data }) {
          const row = rows.find(row => row.id === where.id && row.playerId === where.playerId);
          return Object.assign(row, data);
        },
      },
    }),
  };
  const transfer = (toPlayer, mode) => request('/saved-decks/:id/transfer', {
    fromPlayer: 'A', toPlayer, mode,
  }, prisma, createRecommendationsRouter, { params: { id: source.id } });

  assert.equal((await transfer('A', 'copy')).statusCode, 400);
  assert.equal((await transfer('Another user', 'move')).statusCode, 404);
  assert.equal((await transfer('B', 'copy')).body.id, 'copy-id');
  assert.equal(source.playerId, 'profile-a');
  rows[1].cards = JSON.stringify([...cards].reverse());
  assert.equal((await transfer('B', 'move')).statusCode, 409);
  assert.equal(source.playerId, 'profile-a');
  assert.equal((await transfer('C', 'move')).body.id, source.id);
  assert.equal(source.playerId, 'profile-c');
  assert.equal(rows.length, 2);
});

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

test('explicit recommendation mode controls ranking independently of card filters', async () => {
  const cards = ['Knight', 'Archers', 'Skeleton', 'Ice Spirit', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const player = { levels: JSON.stringify(Object.fromEntries(cards.map(card => [card, 14]))), evolutions: '[]', heroes: '[]' };
  const deck = { id: 'deck', cards: JSON.stringify(cards), dataKind: 'match-stats', winRate: 55, slot2Type: null, source: { name: 'Source' } };
  const queries = [];
  const prisma = {
    player: { findUnique: async () => player },
    metaDeck: { findMany: async query => { queries.push(query); return [deck]; } },
  };
  const recommend = (mode, filters = {}) => request('/recommend', { playerName: 'Player', mode, ...filters }, prisma);
  const account = await recommend('account', { includeCards: ['Hog Rider'] });
  assert.equal(account.body.decks[0].averageLevel, 14);
  assert.deepEqual(queries[0].where, { isActive: true });
  assert.equal((await recommend('account', { excludeCards: ['Hog Rider'] })).body.totalDecks, 0);
  assert.equal((await recommend('meta')).body.decks[0].score, 55);
  assert.deepEqual(queries[2].where, { isActive: true });
});

test('both recommendation modes report the same owned levels and missing cards', async () => {
  const cards = ['The Log', 'Knight', 'Archers', 'Skeleton', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const levels = { Log: 1, Knight: 13, Archers: 13, Skeleton: 13, Fireball: 13, Cannon: 13, Valkyrie: 13 };
  const prisma = {
    player: { findUnique: async () => ({ levels: JSON.stringify(levels), evolutions: '[]', heroes: '[]' }) },
    metaDeck: { findMany: async () => [{
      id: 'deck', cards: JSON.stringify(cards), dataKind: 'match-stats', winRate: 55, slot2Type: null, source: { name: 'Source' },
    }] },
  };
  const recommend = async mode => {
    const result = await request('/recommend', { playerName: 'Player', mode }, prisma);
    assert.equal(result.statusCode, 200);
    return result.body.decks[0];
  };
  const [account, meta] = await Promise.all([recommend('prospective'), recommend('meta')]);
  assert.equal(await recommend('account'), undefined);
  assert.equal(await recommend(undefined), undefined);
  const plan = await request('/diagnose-deck', {
    playerName: 'Player', deckId: 'deck', source: 'meta', targetLevel: 16,
  }, {
    ...prisma,
    metaDeck: { findFirst: async ({ where }) => {
      assert.deepEqual(where, { id: 'deck', isActive: true });
      return { name: 'Meta deck', cards: JSON.stringify(cards) };
    } },
  });
  assert.equal(plan.statusCode, 200);
  assert.equal(account.upgrade.totalGold, plan.body.totalGold);
  assert.equal(account.upgrade.neededCopies, plan.body.details.reduce((sum, card) => sum + card.neededCards, 0));
  assert.deepEqual(account.cardLevels, meta.cardLevels);
  assert.equal(account.cardLevels['The Log'], 1);
  assert.equal(account.cardLevels['Hog Rider'], null);
  for (const deck of [account, meta]) {
    assert.equal(deck.missingCardsCount, 1);
    assert.equal(deck.averageLevel, 79 / 7);
  }
  assert.equal(meta.score, 55);
  assert.equal(account.score, 10);
});

test('both diagnoses use the same upgrade costs and validate the target level', async () => {
  const levels = { Knight: 14, Archers: 15, Skeleton: 16 };
  const prisma = {
    player: { findUnique: async () => ({ id: 'p', levels: JSON.stringify(levels) }) },
    savedDeck: { findFirst: async () => ({ name: 'Deck', cards: JSON.stringify(Object.keys(levels)) }) },
  };
  const body = { playerName: 'Player', deckId: 'deck' };
  for (const path of ['/diagnose', '/diagnose-deck']) {
    for (const targetLevel of [0, 17, 15.5, '16', null]) {
      assert.equal((await request(path, { ...body, targetLevel }, {})).statusCode, 400);
    }
    const adjacent = await request(path, { ...body, targetLevel: 15 }, prisma);
    assert.equal(adjacent.body.totalGold, 90000);
    assert.equal(adjacent.body.details.find(detail => detail.card === 'Knight').neededCards, 5500);

    const max = await request(path, { ...body, targetLevel: 16 }, prisma);
    assert.equal(max.body.totalGold, 330000);
    assert.equal(max.body.details.find(detail => detail.card === 'Archers').neededGold, 120000);
    assert.equal(max.body.details.find(detail => detail.card === 'Archers').neededCards, 7500);
    const maxedCard = max.body.details.find(detail => detail.card === 'Skeleton');
    if (path === '/diagnose-deck') {
      assert.deepEqual([maxedCard.neededGold, maxedCard.neededCards], [0, 0]);
    } else {
      assert.equal(maxedCard, undefined);
    }
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
        assert.deepEqual(where.ownerId_name, { name: ' Player ', ownerId: 'user-a' });
        return null;
      },
    },
  });
  assert.deepEqual(result, { statusCode: 404, body: { error: 'Player not found' } });
});

test('Clan War expands the pool only when saved decks cannot form a filtered group of four', async () => {
  const groups = Array.from({ length: 5 }, (_, group) =>
    Array.from({ length: 8 }, (_, card) => `card-${group}-${card}`));
  const row = (id, cards) => ({ id, name: id, cards: JSON.stringify(cards) });
  const saved = groups.slice(0, 4).map((cards, index) => row(`saved-${index}`, cards));
  const levels = JSON.stringify(Object.fromEntries(groups.flat().map(card => [card, 15])));
  const blocked = groups[4][0];
  let metaReads = 0;
  const prisma = {
    player: { findUnique: async () => ({ id: 'p', levels, evolutions: '[]', heroes: '[]' }) },
    savedDeck: { findMany: async () => saved },
    metaDeck: { findMany: async ({ where }) => {
      assert.deepEqual(where, { isActive: true });
      metaReads++;
      return [row('blocked-meta', groups[4]), row('valid-meta', groups[3])];
    } },
  };
  const recommend = (overrides = {}) => request('/recommend-cw', {
    playerName: 'Player', requiredDeckIds: ['saved-0'], excludeCards: [blocked],
    includeCards: [groups[0][0], groups[2][0]], limit: 1, ...overrides,
  }, prisma);
  const resultIds = result => result.body.combinations[0].decks.map(deck => deck.deckId);

  assert.deepEqual(resultIds(await recommend()), ['saved-0', 'saved-1', 'saved-2', 'saved-3']);
  assert.equal(metaReads, 0);

  // Four saved rows still exist, but two now overlap.
  saved[3] = row('saved-3', groups[0]);
  const expanded = await recommend();
  assert.equal(expanded.body.foundSize, 4);
  assert.deepEqual(resultIds(expanded), ['saved-0', 'saved-1', 'saved-2', 'valid-meta']);
  assert.equal(metaReads, 1);

  const best = await recommend({ mode: 'best' });
  assert.deepEqual(resultIds(best), resultIds(expanded));
  assert.equal(metaReads, 2);

  const partial = await recommend({ excludeCards: [groups[3][0], blocked] });
  assert.equal(partial.body.foundSize, 3);
  assert.deepEqual(resultIds(partial), ['saved-0', 'saved-1', 'saved-2']);
  assert.ok(partial.body.suggestions.some(suggestion => suggestion.includes('исключённых')));
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
    source, slot2Type: null, isActive: true, ...fields,
  });
  const rows = [
    row('a', ['Knight', 'Ice Spirit'], { winRate: 100 }),
    row('b', ['Knight', 'Archers'], { dataKind: 'example', winRate: 99 }),
    row('c', ['Knight', 'Skeleton'], { dataKind: 'top-ladder' }),
    row('d', ['Archers', 'Skeleton'], { tier: 'S' }),
    row('e', ['Knight', 'Goblins'], { dataKind: 'match-stats', winRate: 55 }),
  ];
  const result = await request('/recommend', {
    playerName: 'Player', includeCards: ['Knight'], excludeCards: ['Ice Spirit'], limit: 1,
  }, {
    player: { findUnique: async () => ({ levels: '{}', evolutions: '[]', heroes: '[]' }) },
    metaDeck: {
      findMany: async query => {
        assert.deepEqual(query.orderBy, { name: 'asc' });
        assert.deepEqual(query.where, { isActive: true });
        return rows;
      },
    },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.totalDecks, 3);
  assert.deepEqual(result.body.decks.map(({ id, cards, score, bonus }) => ({ id, cards, score, bonus })), [
    { id: 'e', cards: ['Knight', 'Goblins'], score: 55, bonus: 0 },
  ]);
});

test('meta recommendations validate and apply provenance filters before ranking', async () => {
  const body = { playerName: 'Player', mode: 'meta' };
  const metaFilters = { gameMode: 'ranked', since: '2026-11-01', minSample: 100, dataKind: 'match-stats' };
  const row = (id, sampleSize, gameMode, dataDate) => ({
    id, name: id, dataKind: 'match-stats', gameMode, dataDate, sampleSize,
    winRate: 55, cards: '["Knight"]', source: { name: 'Catalog source' },
  });
  assert.equal((await request('/recommend', { ...body, metaFilters: { since: '2026-02-30' } }, {})).statusCode, 400);
  const result = await request('/recommend', { ...body, metaFilters }, {
    player: { findUnique: async () => ({ levels: '{}', evolutions: '[]', heroes: '[]' }) },
    metaDeck: { findMany: async ({ where }) => {
      assert.deepEqual(where, {
        isActive: true, dataDate: { gte: '2026-11-01' }, sampleSize: { gte: 100 }, dataKind: 'match-stats',
      });
      return [
        row('a', 100, 'Ranked', '2026-11-08'),
        row('b', 200, 'Ranked', '2026-11-03'),
        row('c', 200, 'Ranked', '2026-11-07'),
        row('d', 500, 'Classic Challenge', '2026-11-08'),
      ];
    } },
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.decks.map(deck => deck.id), ['c', 'b', 'a']);
  assert.equal(result.body.decks[0].sampleSize, 200);
});

const duplicateCards = ['Knight', 'Ice Spirit', 'The Log', 'Skeleton', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
const checkDuplicatesPath = '/meta-decks/check-duplicates';
const metaDeck = (id, cards, slot2Type = null) => ({ id, name: id, cards: JSON.stringify(cards), slot2Type });

test('duplicate check compares normalized bases, describes slots and one-card differences, and excludes the edited row', async () => {
  const [knight, ice, log, ...rest] = duplicateCards;
  const queries = [];
  const prisma = {
    metaDeck: { findMany: async query => {
      queries.push(query);
      return [
        metaDeck('exact', [knight, ice, log, ...rest]),
        metaDeck('special', [ice, knight, log, ...rest]),
        metaDeck('similar', [knight, ice, log, ...rest.slice(0, -1), 'Goblins']),
        { id: 'malformed', cards: '[' },
      ];
    } },
    savedDeck: { findMany: async query => {
      queries.push(query);
      return [{ id: 'saved', name: 'Saved', cards: JSON.stringify(duplicateCards),
        player: { name: 'Twink', evolutions: '["Knight"]', heroes: '[]' } }];
    } },
  };
  const check = body => request(checkDuplicatesPath, body, prisma, createMetaDecksRouter);
  assert.equal((await check({ cards: [knight, ice, log, 'Log', ...rest.slice(1)] })).statusCode, 400);
  assert.equal(queries.length, 0);
  const cards = [knight, ice, 'Log', ...rest.toReversed()];
  const result = await check({ cards });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.matches, [
    { id: 'exact', name: 'exact', location: 'meta', kind: 'exact' },
    { id: 'saved', name: 'Saved', location: 'saved', playerName: 'Twink', kind: 'exact' },
    { id: 'special', name: 'special', location: 'meta', kind: 'special-slots' },
    { id: 'similar', name: 'similar', location: 'meta', kind: 'similar', draftCard: 'Valkyrie', existingCard: 'Goblins' },
  ]);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[1].where, { player: { ownerId: 'user-a' } });
  const edit = await check({ cards, editId: 'exact' });
  assert.equal(edit.body.matches.some(match => match.id === 'exact'), false);
  assert.deepEqual(queries[2].where, { id: { not: 'exact' } });

  const dualForm = [ice, log, knight, ...rest];
  const formCatalog = {
    metaDeck: { findMany: async () => [metaDeck('Evolved Knight', dualForm, 'evo')] },
    savedDeck: { findMany: async () => [] },
  };
  const hero = await request(checkDuplicatesPath, { cards: dualForm, slot2Type: 'hero' }, formCatalog, createMetaDecksRouter);
  assert.equal(hero.body.matches[0].kind, 'special-slots');
});

test('deck autofill copies statistics only from a published exact variant', async () => {
  const stats = { id: 'exact', name: 'Catalog deck', winRate: 0, sampleSize: 64, dataDate: '2026-11-15',
    sourceId: 'source', categoryId: 'category', sourceUrl: null, tier: 'A', gameMode: 'Ranked' };
  const rows = [
    metaDeck('exact', duplicateCards),
    metaDeck('different-slots', [duplicateCards[1], duplicateCards[0], ...duplicateCards.slice(2)]),
    metaDeck('similar', [...duplicateCards.slice(0, 7), 'Goblins']),
  ];
  let lookups = 0;
  const prisma = {
    metaDeck: {
      findMany: async () => rows,
      findFirst: async query => {
        lookups++;
        assert.deepEqual(query.where, {
          id: { in: ['exact'] }, isActive: true, dataKind: 'match-stats', winRate: { gte: 0, lte: 100 },
        });
        assert.deepEqual(query.orderBy, [{ dataDate: 'desc' }, { sampleSize: 'desc' }, { id: 'asc' }]);
        return stats;
      },
    },
    savedDeck: { findMany: async () => [] },
  };
  const result = await request(checkDuplicatesPath, { cards: duplicateCards, autofill: true }, prisma, createMetaDecksRouter);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.suggestedStats, stats);
  rows.shift();
  const unmatched = await request(checkDuplicatesPath, { cards: duplicateCards, autofill: true }, prisma, createMetaDecksRouter);
  assert.equal(unmatched.body.suggestedStats, null);
  assert.equal(lookups, 1);
});

test('catalog saves recheck the composition, require variant confirmation, and allow near matches and self-edits', async () => {
  const rows = [metaDeck('Existing', duplicateCards)];
  let writes = 0;
  const tx = {
    metaDeck: {
      findMany: async () => rows,
      findUnique: async ({ where }) => rows.find(deck => deck.id === where.id),
      create: async ({ data }) => { writes++; return data; },
      update: async ({ data }) => { writes++; return data; },
    },
    savedDeck: { findMany: async () => [] },
  };
  const prisma = { $transaction: callback => callback(tx) };
  const draft = { name: 'Variant', cards: duplicateCards, categoryId: 'category', sourceId: 'source' };
  const create = (changes = {}) => request('/meta-decks', { ...draft, ...changes }, prisma, createMetaDecksRouter,
    { method: 'post' });
  const conflict = await create();
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.matches[0].kind, 'exact');
  assert.equal(writes, 0);
  const duplicateConfirmation = conflict.body.duplicateConfirmation;
  assert.ok(duplicateConfirmation);
  assert.equal((await create({ name: 'Another variant', duplicateConfirmation })).statusCode, 409);
  assert.equal((await create({ name: 'Existing' })).body.duplicateConfirmation, undefined);
  assert.equal((await create({ duplicateConfirmation })).statusCode, 200);
  assert.equal((await create({ cards: [...duplicateCards.slice(0, 7), 'Goblins'] })).statusCode, 200);
  const edit = await request('/meta-decks/:id', { ...draft, name: 'Existing' }, prisma, createMetaDecksRouter,
    { method: 'put', params: { id: 'Existing' } });
  assert.equal(edit.statusCode, 200);
  assert.equal(writes, 3);
});

test('recognition returns an editable draft with repeated cards and checks the corrected composition', async t => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fixture';
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });
  const misread = [...duplicateCards];
  misread[5] = misread[1];
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      cards: misread.map(id => ({ id, elixirCost: 1 })),
    }) }] } }],
  }));
  const result = await request('/meta-decks/recognize-image', { image: 'data:image/png;base64,AA==' }, {}, createMetaDecksRouter);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.cards.map(card => card.id), misread);
  const corrected = result.body.cards.map(card => card.id);
  corrected[5] = duplicateCards[5];
  const catalog = { metaDeck: { findMany: async () => [metaDeck('Existing', duplicateCards)] },
    savedDeck: { findMany: async () => [] } };
  const check = await request(checkDuplicatesPath, { cards: corrected }, catalog, createMetaDecksRouter);
  assert.equal(check.body.matches[0].kind, 'exact');
});

test('Gemini recognition requests eight structured cards and reads alternate JSON envelopes', async t => {
  const names = ['GEMINI_API_KEY', 'GEMINI_VISION_MODEL', 'GEMINI_MODELS'];
  const previous = names.map(name => process.env[name]);
  process.env.GEMINI_API_KEY = 'fixture';
  process.env.GEMINI_VISION_MODEL = 'first-model';
  process.env.GEMINI_MODELS = 'fallback-model';
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));

  const cards = duplicateCards.map(id => ({ id, name: id, elixirCost: 1, isEvolution: false, isHero: false }));
  const json = JSON.stringify({ cards });
  const fence = String.fromCharCode(96).repeat(3);
  const responses = [];
  const models = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    models.push(url.match(/\/models\/([^:]+):/)[1]);
    const config = JSON.parse(options.body).generationConfig;
    assert.equal(config.responseMimeType, 'application/json');
    assert.equal(config.temperature, 0.1);
    assert.ok(config.maxOutputTokens > 256);
    assert.equal(config.responseJsonSchema.properties.cards.minItems, 8);
    assert.equal(config.responseJsonSchema.properties.cards.maxItems, 8);
    assert.ok(config.responseJsonSchema.properties.cards.items.required.includes('isHero'));
    const response = responses.shift();
    return Response.json({ candidates: [{ finishReason: response.reason ?? 'STOP', content: { parts: [
      { thought: true, text: 'Internal commentary' },
      { text: response.text },
    ] } }] });
  });

  const recognize = () => request('/meta-decks/recognize-image', { image: 'data:image/png;base64,AA==' }, {}, createMetaDecksRouter);
  for (const text of [json, 'Result:\n' + fence + 'json\n' + json + '\n' + fence + '\nDone.',
      'Result: ' + json + ' Done.', JSON.stringify(cards)]) {
    responses.push({ text });
    const result = await recognize();
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.cards.map(card => card.id), duplicateCards);
  }
  responses.push({ text: json.slice(0, 200), reason: 'MAX_TOKENS' }, { text: json });
  assert.equal((await recognize()).statusCode, 200);
  assert.deepEqual(models.slice(-2), ['first-model', 'fallback-model']);
  responses.push({ text: '{ invalid' }, { text: '{"cards":[null]}' });
  assert.equal((await recognize()).statusCode, 502);
  assert.equal(responses.length, 0);
});

test('Deckshop imports only new names and writes through one transaction per request', async t => {
  const cards = ['Knight', 'Archers', 'Skeleton', 'Ice Spirit', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const html = ['Existing', 'New', 'New'].map(name =>
    '<article class="deck-list-item" data-game-mode="Ranked" data-sample-size="1,234"><h4>' + name + '</h4>' +
    '<span class="win-rate">0%</span>' +
    cards.map(card => '<img alt="' + card + '">').join('') + '</article>'
  ).join('');
  t.mock.method(axios, 'get', async () => ({ status: 200, data: html }));
  const original = { id: 'existing-id', name: 'Existing', tier: 'S' };
  const stored = new Map([[original.name, original]]);
  let transactions = 0;
  const prisma = {
    async $transaction(write) {
      transactions++;
      return write({
        source: { upsert: async () => ({ id: 'source-id' }) },
        category: { upsert: async () => ({ id: 'category-id' }) },
        metaDeck: {
          async upsert({ where, update, create }) {
            assert.deepEqual(update, { name: where.name });
            if (!stored.has(where.name)) stored.set(where.name, create);
            return { id: stored.get(where.name).id };
          },
        },
      });
    },
  };
  const run = () => request('/meta-decks/import-deckshop', {}, prisma, createMetaDecksRouter);
  assert.equal((await run()).body.imported, 1);
  assert.equal((await run()).body.imported, 0);
  assert.equal(transactions, 2);
  assert.equal(stored.get('Existing'), original);
  assert.equal(stored.get('New').avgElixir, 2.9);
  assert.equal(stored.get('New').addedByUsername, 'catalog-admin');
  assert.equal(stored.get('New').dataKind, 'match-stats');
  assert.equal(stored.get('New').gameMode, 'Ranked');
  assert.equal(stored.get('New').sampleSize, 1234);
  assert.equal(stored.get('New').winRate, 0);
});

test('game progress upsert creates the row through the owned player ID', async () => {
  const body = { playerName: 'Player', playerScore: 2, computerScore: 1, record: 4 };
  const result = await request('/game-progress', body, {
    player: {
      findUnique: async ({ where }) => {
        assert.deepEqual(where.ownerId_name, { name: 'Player', ownerId: 'user-a' });
        return { id: 'profile-a' };
      },
    },
    gameProgress: {
      async upsert({ where, create, update }) {
        assert.deepEqual(where, { playerId: 'profile-a' });
        assert.deepEqual(create, { playerId: 'profile-a', playerScore: 2, computerScore: 1, record: 4 });
        assert.deepEqual(update, { playerScore: 2, computerScore: 1, record: 4 });
        return create;
      },
    },
  }, createPlayersRouter);
  assert.deepEqual(result, { statusCode: 200, body: { playerScore: 2, computerScore: 1, record: 4 } });
});

test('Top Ladder parser resolves aliases while preserving card order and rejects duplicate IDs', () => {
  const names = ['Skeletons', 'Knight', 'Archers', 'Minion Horde', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  const result = parseTopLadderDeck(names.map(name => ({ name })));
  const expected = ['Skeleton', 'Knight', 'Archers', 'Horde', 'Fireball', 'Cannon', 'Hog Rider', 'Valkyrie'];
  assert.deepEqual(result, { cards: expected, compositionKey: JSON.stringify([...expected].sort()) });
  const duplicate = names.map((name, index) => ({ name: index === 1 ? 'Skeleton' : name }));
  assert.match(parseTopLadderDeck(duplicate).error, /Дубликат ID/);
});
