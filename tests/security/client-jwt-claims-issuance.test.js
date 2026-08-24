'use strict';

/**
 * BEHAVIORAL SECURITY REGRESSION TEST — SESSION-REVOCATION-007F-A (émission JWT)
 *
 * Cible : apps/api/src/routes/client/authAccount.js, routes POST /register et
 * POST /login — prouve que les DEUX points d'émission du JWT client produisent
 * bien sub = clients.id ET aid = client_accounts.id, conformément à
 * l'architecture validée aux lots 007E/007E-R1.
 *
 * Ce test N'EST PAS un grep sur la chaîne "aid" : il exécute les VRAIS handlers
 * de route (register/login réels, via router.stack), avec db.js/bcryptjs/
 * jsonwebtoken mockés via require.cache (même pattern que
 * client-account-disable-login.test.js), et capture les arguments réels passés
 * à jwt.sign() pour vérifier leur contenu exact.
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-a-real-credential';

const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'apps', 'api', 'src', 'db.js');
const AUTH_ACCOUNT_PATH = path.join(ROOT, 'apps', 'api', 'src', 'routes', 'client', 'authAccount.js');

let passed = 0;
let failed = 0;
const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

async function runTests() {
  for (const { name, fn } of pendingTests) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${name}`);
      console.log(`        ${err.message}`);
      failed++;
    }
  }
}

/* =====================================================================
   MOCKS
   ===================================================================== */
const state = {
  lastSignedPayload: null,
  signCalls: 0,
};

function fakeModule(exports) {
  const m = new Module('mock', null);
  m.exports = exports;
  m.loaded = true;
  return m;
}

require.cache[require.resolve(DB_PATH)] = fakeModule({
  query: async (sql, params) => {
    // /register : vérification email existant → aucun conflit
    if (/SELECT id FROM comptaclems\.client_accounts WHERE email/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    // /register : INSERT clients ... RETURNING id, first_name, last_name
    if (/INSERT INTO comptaclems\.clients/i.test(sql)) {
      return { rows: [{ id: 4242, first_name: params[0], last_name: params[1] }] };
    }
    // /register : INSERT client_accounts ... RETURNING id
    if (/INSERT INTO comptaclems\.client_accounts/i.test(sql)) {
      return { rows: [{ id: 7777 }] };
    }
    // /login : SELECT ca.id AS account_id ... WHERE ca.email
    if (/SELECT ca\.id AS account_id/i.test(sql) && /WHERE ca\.email/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          account_id: 8888,
          password_hash: 'hashed',
          email_verified: true,
          is_active: true,
          client_id: 5151,
          first_name: 'Marie',
          last_name: 'Tremblay',
        }],
      };
    }
    // BEGIN / COMMIT / ROLLBACK / UPDATE last_login_at : no-op
    return { rowCount: 1, rows: [] };
  },
});

require.cache[require.resolve('bcryptjs')] = fakeModule({
  hash: async (v) => `hashed:${v}`,
  compare: async () => true,
});

require.cache[require.resolve('jsonwebtoken')] = fakeModule({
  sign: (payload, secret, opts) => {
    state.lastSignedPayload = payload;
    state.signCalls++;
    return 'fake.jwt.token';
  },
  verify: () => { throw new Error('not used in this test'); },
});

const router = require(AUTH_ACCOUNT_PATH);

function findRouteHandler(method, routePath) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === routePath) {
      const methodLayer = layer.route.stack.find((s) => s.method === method.toLowerCase());
      if (methodLayer) return methodLayer.handle;
    }
  }
  throw new Error(`Route ${method} ${routePath} introuvable dans authAccount.js`);
}

const registerHandler = findRouteHandler('post', '/register');
const loginHandler = findRouteHandler('post', '/login');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie() { return this; },
  };
}

function resetState() {
  state.lastSignedPayload = null;
  state.signCalls = 0;
}

/* =====================================================================
   1. REGISTER : sub = clients.id (4242), aid = client_accounts.id (7777)
   ===================================================================== */
test('POST /register émet un JWT avec sub = clients.id et aid = client_accounts.id', async () => {
  resetState();
  const req = {
    body: {
      email: 'nouveau@example.com',
      password: 'CorrectHorseBattery1!',
      first_name: 'Jean',
      last_name: 'Dupont',
      phone: '5145551234',
      canada_status: 'resident',
    },
  };
  const res = makeRes();
  await registerHandler(req, res, (err) => { if (err) throw err; });

  assert.strictEqual(state.signCalls, 1, 'jwt.sign() aurait dû être appelé exactement une fois');
  assert.ok(state.lastSignedPayload, 'aucun payload capturé');
  assert.strictEqual(state.lastSignedPayload.sub, String(4242), `sub attendu = clients.id (4242), obtenu ${state.lastSignedPayload.sub}`);
  assert.strictEqual(state.lastSignedPayload.aid, 7777, `aid attendu = client_accounts.id (7777), obtenu ${state.lastSignedPayload.aid}`);
  assert.strictEqual(state.lastSignedPayload.type, 'client');
});

/* =====================================================================
   2. LOGIN : sub = clients.id (5151), aid = client_accounts.id (8888)
   ===================================================================== */
test('POST /login émet un JWT avec sub = clients.id et aid = client_accounts.id', async () => {
  resetState();
  const req = {
    body: { email: 'existant@example.com', password: 'CorrectHorseBattery1!', rememberMe: false },
  };
  const res = makeRes();
  await loginHandler(req, res, (err) => { if (err) throw err; });

  assert.strictEqual(state.signCalls, 1, 'jwt.sign() aurait dû être appelé exactement une fois');
  assert.ok(state.lastSignedPayload, 'aucun payload capturé');
  assert.strictEqual(state.lastSignedPayload.sub, String(5151), `sub attendu = clients.id (5151), obtenu ${state.lastSignedPayload.sub}`);
  assert.strictEqual(state.lastSignedPayload.aid, 8888, `aid attendu = client_accounts.id (8888), obtenu ${state.lastSignedPayload.aid}`);
  assert.strictEqual(state.lastSignedPayload.type, 'client');
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
});
