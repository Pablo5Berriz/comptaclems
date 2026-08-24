'use strict';

/**
 * BEHAVIORAL SECURITY REGRESSION TEST — SESSION-REVOCATION-007F-B (émission JWT admin)
 *
 * Cible : les 3 points d'émission d'un JWT admin FINAL (type: 'admin'), qui
 * doivent tous porter tv = admin.token_version :
 *   1. apps/api/src/routes/admin/auth.js       POST /register (bootstrap)
 *   2. apps/api/src/routes/admin/auth.js       POST /login (connexion directe, sans 2FA)
 *   3. apps/api/src/routes/admin/twoFactor.js  POST /2fa/validate-login (JWT final après TOTP)
 *
 * admin_2fa_pending (token temporaire, 5 min, émis par sign2faPendingToken dans
 * auth.js) N'EST PAS une session finale — il n'est délibérément PAS testé ici
 * comme point d'émission de session, conformément à la décision actée en
 * 007E-R1/007F-B : il ne porte pas tv, seule /2fa/validate-login émet la
 * session admin réelle après la vérification TOTP.
 *
 * Ce test N'EST PAS un grep : il exécute les VRAIS handlers de route (register,
 * login, validate-login réels, via router.stack), avec db.js/bcryptjs/
 * jsonwebtoken/speakeasy mockés via require.cache, et capture les arguments
 * réels passés à jwt.sign() pour vérifier leur contenu exact.
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-a-real-credential';
process.env.ADMIN_BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET || 'test-bootstrap-secret-not-real';

const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'apps', 'api', 'src', 'db.js');
const ADMIN_AUTH_PATH = path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'auth.js');
const TWO_FACTOR_PATH = path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'twoFactor.js');

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
    if (/SELECT id FROM comptaclems\.admin WHERE email/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    // /register : INSERT ... RETURNING *
    if (/INSERT INTO comptaclems\.admin/i.test(sql)) {
      return {
        rows: [{
          id: 111,
          first_name: params[0],
          last_name: params[1],
          email: params[2],
          phone: params[3],
          role: params[4],
          is_active: true,
          created_at: new Date().toISOString(),
          token_version: 1,
        }],
      };
    }
    // /login : SELECT * FROM comptaclems.admin WHERE email = $1
    if (/SELECT \*\s*FROM\s*comptaclems\.admin\s*WHERE email/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          id: 222,
          first_name: 'Login',
          last_name: 'Direct',
          email: params[0],
          role: 'admin',
          is_active: true,
          totp_enabled: false,
          password_hash: 'hashed:whatever',
          token_version: 5,
        }],
      };
    }
    // /2fa/validate-login : SELECT id, totp_secret, role, email, first_name, last_name, token_version
    if (/SELECT id, totp_secret, role, email, first_name, last_name, token_version/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          id: 333,
          totp_secret: 'FAKE2FASECRET',
          role: 'support',
          email: 'twofactor@example.com',
          first_name: 'Two',
          last_name: 'Factor',
          token_version: 9,
        }],
      };
    }
    return { rowCount: 0, rows: [] };
  },
});

require.cache[require.resolve('bcryptjs')] = fakeModule({
  hash: async (v) => `hashed:${v}`,
  compare: async () => true,
});

require.cache[require.resolve('jsonwebtoken')] = fakeModule({
  sign: (payload) => {
    state.lastSignedPayload = payload;
    state.signCalls++;
    return 'fake.jwt.token';
  },
  verify: () => ({ sub: 333, type: 'admin_2fa_pending', email: 'twofactor@example.com' }),
});

require.cache[require.resolve('speakeasy')] = fakeModule({
  generateSecret: () => ({ base32: 'FAKESECRET', otpauth_url: 'otpauth://fake' }),
  totp: {
    verify: () => true, // code TOTP toujours accepté dans ce test — seul le claim tv émis nous intéresse
  },
});

const adminAuthRouter = require(ADMIN_AUTH_PATH);
const twoFactorRouter = require(TWO_FACTOR_PATH);

function findRouteHandler(routerObj, method, routePath) {
  for (const layer of routerObj.stack) {
    if (layer.route && layer.route.path === routePath) {
      const matches = layer.route.stack.filter((s) => s.method === method.toLowerCase());
      if (matches.length) return matches[matches.length - 1].handle; // dernière couche = handler final (après d'éventuels middlewares comme loginLimiter)
    }
  }
  throw new Error(`Route ${method} ${routePath} introuvable`);
}

const registerHandler = findRouteHandler(adminAuthRouter, 'post', '/register');
const loginHandler = findRouteHandler(adminAuthRouter, 'post', '/login');
const validateLoginHandler = findRouteHandler(twoFactorRouter, 'post', '/validate-login');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function resetState() {
  state.lastSignedPayload = null;
  state.signCalls = 0;
}

/* =====================================================================
   1. BOOTSTRAP/REGISTER : tv = token_version (défaut 1 pour un nouvel admin)
   ===================================================================== */
test('POST /register (bootstrap) émet un JWT admin avec tv = admin.token_version', async () => {
  resetState();
  const req = {
    header: (name) => (name === 'x-admin-bootstrap' ? process.env.ADMIN_BOOTSTRAP_SECRET : undefined),
    body: {
      first_name: 'Nouvel',
      last_name: 'Admin',
      email: 'nouvel.admin@example.com',
      phone: '5145551234',
      password: 'CorrectHorseBattery1!',
      role: 'admin',
    },
  };
  const res = makeRes();
  await registerHandler(req, res);

  assert.strictEqual(res.statusCode, 201, `attendu 201, obtenu ${res.statusCode} (body: ${JSON.stringify(res.body)})`);
  assert.strictEqual(state.signCalls, 1, 'jwt.sign() aurait dû être appelé exactement une fois');
  assert.ok(state.lastSignedPayload, 'aucun payload capturé');
  assert.strictEqual(state.lastSignedPayload.sub, 111);
  assert.strictEqual(state.lastSignedPayload.type, 'admin');
  assert.strictEqual(state.lastSignedPayload.tv, 1, `tv attendu = token_version (1), obtenu ${state.lastSignedPayload.tv}`);
});

/* =====================================================================
   2. LOGIN DIRECT (sans 2FA) : tv = token_version
   ===================================================================== */
test('POST /login (connexion directe, sans 2FA) émet un JWT admin avec tv = admin.token_version', async () => {
  resetState();
  const req = { body: { email: 'login.direct@example.com', password: 'CorrectHorseBattery1!' } };
  const res = makeRes();
  await loginHandler(req, res);

  assert.strictEqual(res.statusCode, 200, `attendu 200, obtenu ${res.statusCode} (body: ${JSON.stringify(res.body)})`);
  assert.strictEqual(state.signCalls, 1, 'jwt.sign() aurait dû être appelé exactement une fois');
  assert.ok(state.lastSignedPayload, 'aucun payload capturé');
  assert.strictEqual(state.lastSignedPayload.sub, 222);
  assert.strictEqual(state.lastSignedPayload.type, 'admin');
  assert.strictEqual(state.lastSignedPayload.tv, 5, `tv attendu = token_version (5), obtenu ${state.lastSignedPayload.tv}`);
});

/* =====================================================================
   3. 2FA VALIDATE-LOGIN : JWT final après TOTP, tv = token_version
   ===================================================================== */
test('POST /2fa/validate-login émet le JWT admin FINAL avec tv = admin.token_version (pas le pending token)', async () => {
  resetState();
  const req = { body: { temp_token: 'irrelevant-mocked-verify-ignores-signature', code: '123456' } };
  const res = makeRes();
  await validateLoginHandler(req, res);

  assert.strictEqual(res.statusCode, 200, `attendu 200, obtenu ${res.statusCode} (body: ${JSON.stringify(res.body)})`);
  assert.strictEqual(state.signCalls, 1, 'jwt.sign() aurait dû être appelé exactement une fois (JWT final uniquement)');
  assert.ok(state.lastSignedPayload, 'aucun payload capturé');
  assert.strictEqual(state.lastSignedPayload.sub, String(333));
  assert.strictEqual(state.lastSignedPayload.type, 'admin', 'le JWT final doit être type=admin, pas admin_2fa_pending');
  assert.strictEqual(state.lastSignedPayload.tv, 9, `tv attendu = token_version (9), obtenu ${state.lastSignedPayload.tv}`);
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
});
