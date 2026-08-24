'use strict';

/**
 * BEHAVIORAL SECURITY REGRESSION TEST — SESSION-REVOCATION-007F-B
 * (révocation par changement de mot de passe / 2FA)
 *
 * Cible : les VRAIS handlers de route qui doivent incrémenter token_version
 * lors d'un événement de sécurité sensible, prouvant le SQL réellement exécuté
 * (pas un grep sur le texte source) :
 *   - apps/api/src/routes/client/espaceClient.js   PUT /password (self-service)
 *   - apps/api/src/routes/client/reset-password.js POST / (reset par email)
 *   - apps/api/src/routes/admin/settings.js        PUT /profile/password (self)
 *   - apps/api/src/routes/admin/administrateurs.js PATCH /:id/password (superadmin → autre admin)
 *   - apps/api/src/routes/admin/twoFactor.js       POST /verify (activation 2FA)
 *   - apps/api/src/routes/admin/twoFactor.js       POST /disable (désactivation 2FA)
 *   - apps/api/src/routes/admin/twoFactor.js       POST /verify avec code invalide (AUCUN increment)
 *
 * Chaque test capture les vrais appels db.query() (via require.cache) et vérifie
 * qu'un UPDATE contenant "token_version = token_version + 1" a bien été exécuté
 * (ou n'a PAS été exécuté, pour le cas TOTP invalide) — pas seulement que la
 * route répond success:true.
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-a-real-credential';

const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'apps', 'api', 'src', 'db.js');

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

function fakeModule(exports) {
  const m = new Module('mock', null);
  m.exports = exports;
  m.loaded = true;
  return m;
}

/* =====================================================================
   MOCK db.js — un seul mock partagé par tous les routers de ce fichier de
   test. Chaque test réinitialise state.updateLog et state.selectFixtures.
   ===================================================================== */
const TOKEN_VERSION_INCREMENT_RE = /token_version\s*=\s*token_version\s*\+\s*1/i;

const state = {
  updateLog: [],       // { sql, params } — tout UPDATE exécuté pendant le test
  selectFixtures: {},  // clé libre → réponse à renvoyer pour le prochain SELECT correspondant
};

function resetState() {
  state.updateLog = [];
  state.selectFixtures = {};
}

require.cache[require.resolve(DB_PATH)] = fakeModule({
  query: async (sql, params) => {
    if (/^\s*UPDATE/i.test(sql)) {
      state.updateLog.push({ sql, params });
      // Toutes les routes testées ici utilisent RETURNING sur succès.
      if (/RETURNING/i.test(sql)) {
        if (/RETURNING\s+id\s*$/i.test(sql) || /RETURNING id\b/i.test(sql)) {
          return { rowCount: 1, rows: [{ id: params[params.length - 1] ?? 1 }] };
        }
        return { rowCount: 1, rows: [{ token_version: 999 }] };
      }
      return { rowCount: 1, rows: [] };
    }

    // ── SELECT : dispatch par empreinte de colonnes/table ──
    if (/SELECT id, password_hash\s*$/im.test(sql) || (/SELECT\s+id,\s*password_hash/i.test(sql) && /client_accounts/i.test(sql))) {
      return { rowCount: 1, rows: [{ id: 501, password_hash: 'hashed:old' }] };
    }
    if (/SELECT password_hash FROM comptaclems\.admin/i.test(sql)) {
      return { rowCount: 1, rows: [{ password_hash: 'hashed:old' }] };
    }
    if (/FROM comptaclems\.password_reset_tokens/i.test(sql) && /WHERE token = \$1/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{ id: 1, client_id: 42, expires_at: new Date(Date.now() + 3600_000).toISOString(), used: false }],
      };
    }
    if (/SELECT totp_secret_temp FROM comptaclems\.admin/i.test(sql)) {
      return { rowCount: 1, rows: [{ totp_secret_temp: 'TEMPSECRET' }] };
    }
    if (/SELECT totp_secret, totp_enabled FROM comptaclems\.admin/i.test(sql)) {
      return { rowCount: 1, rows: [{ totp_secret: 'REALSECRET', totp_enabled: true }] };
    }

    return { rowCount: 0, rows: [] };
  },
});

require.cache[require.resolve('bcryptjs')] = fakeModule({
  compare: async () => true,
  hash: async (v) => `hashed:${v}`,
});

const speakeasyState = { verifyReturns: true };
require.cache[require.resolve('speakeasy')] = fakeModule({
  generateSecret: () => ({ base32: 'FAKESECRET', otpauth_url: 'otpauth://fake' }),
  totp: {
    verify: () => speakeasyState.verifyReturns,
  },
});

function findRouteHandler(routerObj, method, routePath) {
  for (const layer of routerObj.stack) {
    if (layer.route && layer.route.path === routePath) {
      const matches = layer.route.stack.filter((s) => s.method === method.toLowerCase());
      if (matches.length) return matches[matches.length - 1].handle;
    }
  }
  throw new Error(`Route ${method} ${routePath} introuvable`);
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function countTokenVersionIncrements(targetTableRegex) {
  return state.updateLog.filter(
    (u) => TOKEN_VERSION_INCREMENT_RE.test(u.sql) && targetTableRegex.test(u.sql)
  ).length;
}

/* =====================================================================
   1. CLIENT — changement de mot de passe self-service (espaceClient.js)
   ===================================================================== */
test('client password change (PUT /espace-client/password) → SQL incrémente token_version', async () => {
  resetState();
  const router = require(path.join(ROOT, 'apps', 'api', 'src', 'routes', 'client', 'espaceClient.js'));
  const handler = findRouteHandler(router, 'put', '/password');

  const req = { clientId: 42, body: { currentPassword: 'ancien', newPassword: 'NouveauMotDePasse1!' } };
  const res = makeRes();
  await handler(req, res);

  assert.ok(res.body && res.body.success, `réponse inattendue: ${JSON.stringify(res.body)}`);
  const count = countTokenVersionIncrements(/comptaclems\.client_accounts/i);
  assert.strictEqual(count, 1, `attendu 1 UPDATE incrémentant token_version sur client_accounts, trouvé ${count}`);
});

/* =====================================================================
   2. CLIENT — reset de mot de passe par email (reset-password.js)
   ===================================================================== */
test('client password reset (POST /reset-password) → SQL incrémente token_version', async () => {
  resetState();
  const router = require(path.join(ROOT, 'apps', 'api', 'src', 'routes', 'client', 'reset-password.js'));
  const handler = findRouteHandler(router, 'post', '/');

  const req = { body: { token: 'raw-token-value', password: 'NouveauMotDePasse1!' } };
  const res = makeRes();
  await handler(req, res);

  assert.ok(res.body && res.body.success, `réponse inattendue: ${JSON.stringify(res.body)}`);
  const count = countTokenVersionIncrements(/comptaclems\.client_accounts/i);
  assert.strictEqual(count, 1, `attendu 1 UPDATE incrémentant token_version sur client_accounts, trouvé ${count}`);
});

/* =====================================================================
   3. ADMIN — changement de mot de passe self-service (settings.js)
   ===================================================================== */
test('admin password change self-service (PUT /admin/settings/profile/password) → SQL incrémente token_version', async () => {
  resetState();
  const router = require(path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'settings.js'));
  const handler = findRouteHandler(router, 'put', '/profile/password');

  const req = { admin: { id: 7, role: 'admin' }, body: { current_password: 'ancien', new_password: 'NouveauMotDePasse1!' } };
  const res = makeRes();
  await handler(req, res);

  assert.ok(res.body && res.body.success, `réponse inattendue: ${JSON.stringify(res.body)}`);
  const count = countTokenVersionIncrements(/comptaclems\.admin/i);
  assert.strictEqual(count, 1, `attendu 1 UPDATE incrémentant token_version sur admin, trouvé ${count}`);
});

/* =====================================================================
   4. ADMIN — reset de mot de passe d'un AUTRE admin par un superadmin
      (administrateurs.js)
   ===================================================================== */
test('admin password reset by superadmin (PATCH /admins/:id/password) → SQL incrémente token_version', async () => {
  resetState();
  const router = require(path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'administrateurs.js'));
  const handler = findRouteHandler(router, 'patch', '/:id/password');

  const req = { admin: { id: 1, role: 'superadmin' }, params: { id: '8' }, body: { password: 'NouveauMotDePasse1!' } };
  const res = makeRes();
  await handler(req, res);

  assert.ok(res.body && res.body.success, `réponse inattendue: ${JSON.stringify(res.body)}`);
  const count = countTokenVersionIncrements(/comptaclems\.admin/i);
  assert.strictEqual(count, 1, `attendu 1 UPDATE incrémentant token_version sur admin, trouvé ${count}`);
});

/* =====================================================================
   5. ADMIN 2FA — activation (POST /2fa/verify, code valide) → increment UNE fois
   ===================================================================== */
test('2FA activation réussie (POST /2fa/verify) → SQL incrémente token_version exactement une fois', async () => {
  resetState();
  speakeasyState.verifyReturns = true;
  const router = require(path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'twoFactor.js'));
  const handler = findRouteHandler(router, 'post', '/verify');

  const req = { admin: { id: 7, role: 'admin', email: 'x@y.com' }, body: { code: '123456' } };
  const res = makeRes();
  await handler(req, res);

  assert.ok(res.body && res.body.success, `réponse inattendue: ${JSON.stringify(res.body)}`);
  const count = countTokenVersionIncrements(/comptaclems\.admin/i);
  assert.strictEqual(count, 1, `attendu exactement 1 increment à l'activation 2FA, trouvé ${count}`);
});

/* =====================================================================
   6. ADMIN 2FA — désactivation (POST /2fa/disable, code valide) → increment UNE fois
   ===================================================================== */
test('2FA désactivation réussie (POST /2fa/disable) → SQL incrémente token_version exactement une fois', async () => {
  resetState();
  speakeasyState.verifyReturns = true;
  const router = require(path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'twoFactor.js'));
  const handler = findRouteHandler(router, 'post', '/disable');

  const req = { admin: { id: 7, role: 'admin', email: 'x@y.com' }, body: { code: '123456' } };
  const res = makeRes();
  await handler(req, res);

  assert.ok(res.body && res.body.success, `réponse inattendue: ${JSON.stringify(res.body)}`);
  const count = countTokenVersionIncrements(/comptaclems\.admin/i);
  assert.strictEqual(count, 1, `attendu exactement 1 increment à la désactivation 2FA, trouvé ${count}`);
});

/* =====================================================================
   7. ADMIN 2FA — code TOTP invalide (POST /2fa/verify) → AUCUN increment
   ===================================================================== */
test('2FA activation avec code TOTP invalide → refus, AUCUN increment de token_version', async () => {
  resetState();
  speakeasyState.verifyReturns = false; // code refusé
  const router = require(path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'twoFactor.js'));
  const handler = findRouteHandler(router, 'post', '/verify');

  const req = { admin: { id: 7, role: 'admin', email: 'x@y.com' }, body: { code: '000000' } };
  const res = makeRes();
  await handler(req, res);

  assert.strictEqual(res.statusCode, 400, `attendu 400 (code invalide), obtenu ${res.statusCode}`);
  assert.strictEqual(res.body.success, false);
  const count = countTokenVersionIncrements(/comptaclems\.admin/i);
  assert.strictEqual(count, 0, `un code TOTP invalide ne doit JAMAIS incrémenter token_version, trouvé ${count}`);
  speakeasyState.verifyReturns = true; // reset pour les tests suivants éventuels
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
});
