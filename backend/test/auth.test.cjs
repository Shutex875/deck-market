const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { createAuthRouter, protectApi, requireSession } = require('../dist/routes/auth');
const { hashPassword, verifyPassword } = require('../dist/services/passwords');

function response() {
  return {
    statusCode: 200,
    locals: {},
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    cookie(name, token, options) { this.session = { name, token, options }; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

test('registration normalizes the login and stores only password and session hashes', async () => {
  const password = 'Test-only password';
  let saved;
  const router = createAuthRouter({
    user: {
      async create({ data }) {
        saved = data;
        return { id: 'user-id', username: data.username };
      },
    },
  });
  const register = router.stack.find(layer => layer.route?.path === '/register').route.stack.at(-1).handle;
  const res = response();
  await register({ body: { username: '  Игрок  ', password }, secure: true }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { id: 'user-id', username: 'игрок', isOwner: false, canManageCatalog: false });
  assert.notEqual(saved.passwordHash, password);
  assert.ok(await verifyPassword(password, saved.passwordHash));
  assert.equal(await verifyPassword('another password', saved.passwordHash), false);
  assert.equal(saved.sessions.create.tokenHash, createHash('sha256').update(res.session.token).digest('hex'));
  assert.deepEqual(res.session.options, {
    httpOnly: true, sameSite: 'strict', secure: true, path: '/api', maxAge: 14 * 24 * 60 * 60 * 1000,
  });
});

test('authentication rejects missing and expired cookies and supplies the session owner', async () => {
  const token = '1'.repeat(64);
  const user = { id: 'user-id', username: 'player' };
  let lookups = 0;
  let expiresAt = new Date(0);
  const guard = requireSession({
    session: {
      async findUnique({ where }) {
        lookups++;
        assert.equal(where.tokenHash, createHash('sha256').update(token).digest('hex'));
        return { expiresAt, user };
      },
    },
  });
  const missing = response();
  await guard({ headers: {} }, missing, () => assert.fail('unexpected access'));
  assert.equal(missing.statusCode, 401);
  assert.equal(lookups, 0);
  const req = { headers: { cookie: 'bastdecks_session=' + token } };
  const expired = response();
  await guard(req, expired, () => assert.fail('expired session accepted'));
  assert.equal(expired.statusCode, 401);
  assert.equal(expired.headers['X-BastDecks-Session'], 'expired');
  expiresAt = new Date(Date.now() + 60_000);
  const authorized = response();
  let passed = false;
  await guard(req, authorized, () => { passed = true; });
  assert.ok(passed);
  assert.deepEqual(authorized.locals.user, { ...user, isOwner: false, canManageCatalog: false });
});

test('state-changing API requests require the application header', () => {
  const blocked = response();
  protectApi({ method: 'POST', get: () => undefined }, blocked, () => assert.fail('request accepted'));
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.headers['Cache-Control'], 'no-store');
  let passed = false;
  protectApi({ method: 'POST', get: () => '1' }, response(), () => { passed = true; });
  assert.ok(passed);
});

test('profile changes require the current password and only replace sessions on password change', async () => {
  const currentPassword = 'Test-only current password';
  const newPassword = 'Test-only replacement password';
  const passwordHash = await hashPassword(currentPassword);
  const user = { id: 'user-id', username: 'original', passwordHash };
  const writes = [];
  const router = createAuthRouter({
    user: {
      async findUnique({ where }) {
        assert.deepEqual(where, { id: user.id });
        return user;
      },
      async update(query) {
        writes.push(query);
        return { id: user.id, username: query.data.username };
      },
    },
  });
  const update = router.stack.find(layer => layer.route?.path === '/me' && layer.route.methods.patch)
    .route.stack.at(-1).handle;
  const submit = async body => {
    const res = response();
    res.locals.user = { id: user.id };
    await update({ body, secure: true }, res);
    return res;
  };

  assert.equal((await submit({ username: 'new-login', currentPassword: 'wrong password' })).statusCode, 403);
  assert.equal(writes.length, 0);
  const rename = await submit({ username: ' New-Login ', currentPassword });
  assert.deepEqual(rename.body, { id: user.id, username: 'new-login', isOwner: false, canManageCatalog: false });
  assert.deepEqual(writes[0].data, { username: 'new-login' });
  assert.equal(rename.session, undefined);

  const changed = await submit({ currentPassword, newPassword });
  assert.deepEqual(writes[1].where, { id: user.id, username: user.username, passwordHash });
  assert.ok(await verifyPassword(newPassword, writes[1].data.passwordHash));
  const tokenHash = createHash('sha256').update(changed.session.token).digest('hex');
  assert.equal(writes[1].data.sessions.create.tokenHash, tokenHash);
  assert.deepEqual(writes[1].data.sessions.deleteMany, { tokenHash: { not: tokenHash } });
});
