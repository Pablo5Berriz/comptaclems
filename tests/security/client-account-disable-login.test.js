'use strict';

/**
 * BEHAVIORAL SECURITY REGRESSION TEST — AUTH-BYPASS-CLIENT-DISABLE
 *
 * Cible : apps/api/src/routes/client/authAccount.js, route POST /login.
 *
 * Contexte (audit 007A) : un client désactivé par un admin (client_accounts.is_active
 * = false) pouvait obtenir une NOUVELLE session normalement — le login ne lisait ni
 * ne vérifiait cette colonne. Ce test exécute le VRAI handler de route (pas une
 * réimplémentation) avec des dépendances (db, bcryptjs, jsonwebtoken) mockées et
 * contrôlées, pour prouver le comportement réel plutôt que de simplement grep le
 * texte source.
 *
 * Hors périmètre (conforme à la directive 007C-P1A) : révocation des sessions/JWT
 * déjà émis avant désactivation — non testé ici, documenté comme risque résiduel
 * connu dans le rapport du lot.
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = 'test-only-secret-not-a-real-credential';

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
   MOCKS — injectés dans require.cache AVANT le premier require() du
   fichier audité, pour intercepter db.js / bcryptjs / jsonwebtoken sans
   toucher au filesystem ni à une vraie DB.
   ===================================================================== */

const state = {
  // scénario contrôlé par chaque test : la ligne renvoyée par la "DB" pour /login
  loginRow: null,
  lastLoginSelectSql: null,
  lastQueryParams: null,
  bcryptCompareCalls: 0,
  bcryptCompareResult: true,
  jwtSignCalls: 0,
  cookieSetCalls: 0,
};

function fakeModule(exports) {
  const m = new Module('mock', null);
  m.exports = exports;
  m.loaded = true;
  return m;
}

require.cache[require.resolve(DB_PATH)] = fakeModule({
  query: async (sql, params) => {
    // On capture spécifiquement la requête SELECT de login (elle est suivie
    // par un UPDATE last_login_at qui écraserait sinon cette capture).
    if (/SELECT/i.test(sql) && /FROM comptaclems\.client_accounts/i.test(sql) && /WHERE ca\.email/i.test(sql)) {
      state.lastLoginSelectSql = sql;
      state.lastQueryParams = params;
      return state.loginRow
        ? { rowCount: 1, rows: [state.loginRow] }
        : { rowCount: 0, rows: [] };
    }
    // UPDATE last_login_at et toute autre requête : no-op
    return { rowCount: 1, rows: [] };
  },
});

require.cache[require.resolve('bcryptjs')] = fakeModule({
  compare: async (plain, hash) => {
    state.bcryptCompareCalls++;
    return state.bcryptCompareResult;
  },
  hash: async (v) => `hashed:${v}`,
});

require.cache[require.resolve('jsonwebtoken')] = fakeModule({
  sign: (payload, secret, opts) => {
    state.jwtSignCalls++;
    return 'fake.jwt.token';
  },
  verify: () => { throw new Error('not used in this test'); },
});

/* =====================================================================
   Chargement du VRAI fichier audité (une seule fois, avec les mocks ci-dessus)
   ===================================================================== */
const router = require(AUTH_ACCOUNT_PATH);

function findRouteHandler(method, routePath) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === routePath) {
      const methodLayer = layer.route.stack.find(
        (s) => s.method === method.toLowerCase()
      );
      if (methodLayer) return methodLayer.handle;
    }
  }
  throw new Error(`Route ${method} ${routePath} introuvable dans authAccount.js`);
}

const loginHandler = findRouteHandler('post', '/login');

/* =====================================================================
   Harness d'appel — simule req/res Express minimal
   ===================================================================== */
async function callLogin({ email = 'client@example.com', password = 'CorrectHorseBattery1!' } = {}) {
  const req = { body: { email, password, rememberMe: false } };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    cookie() { state.cookieSetCalls++; return this; },
  };
  await loginHandler(req, res, (err) => { if (err) throw err; });
  return res;
}

function resetState(overrides) {
  state.loginRow = null;
  state.lastLoginSelectSql = null;
  state.lastQueryParams = null;
  state.bcryptCompareCalls = 0;
  state.bcryptCompareResult = true;
  state.jwtSignCalls = 0;
  state.cookieSetCalls = 0;
  Object.assign(state, overrides);
}

/* =====================================================================
   1. La requête de login lit bien le champ d'activation réel
   ===================================================================== */
test("la requête SQL de /login sélectionne ca.is_active (client_accounts)", async () => {
  resetState({
    loginRow: {
      account_id: 1, password_hash: 'x', email_verified: true, is_active: true,
      client_id: 42, first_name: 'Jean', last_name: 'Dupont',
    },
  });
  await callLogin();
  assert.ok(state.lastLoginSelectSql, 'aucune requête SELECT de login capturée');
  assert.match(state.lastLoginSelectSql, /ca\.is_active/i, 'la requête login ne sélectionne pas ca.is_active');
});

/* =====================================================================
   2 + 3. is_active = false + mot de passe correct => refus, AUCUN jwt.sign()
   ===================================================================== */
test('is_active=false + mot de passe correct => login refusé, jwt.sign jamais appelé', async () => {
  resetState({
    loginRow: {
      account_id: 2, password_hash: 'x', email_verified: true, is_active: false,
      client_id: 43, first_name: 'Marie', last_name: 'Tremblay',
    },
    bcryptCompareResult: true,
  });
  const res = await callLogin();
  assert.strictEqual(res.statusCode, 403, `attendu 403, obtenu ${res.statusCode}`);
  assert.ok(res.body && /désactivé/i.test(res.body.error || ''), `message inattendu: ${JSON.stringify(res.body)}`);
  assert.strictEqual(state.jwtSignCalls, 0, 'jwt.sign() a été appelé pour un compte désactivé');
  assert.strictEqual(state.cookieSetCalls, 0, 'un cookie de session a été posé pour un compte désactivé');
});

/* =====================================================================
   4. is_active = true => flux normal préservé (jwt émis, cookie posé)
   ===================================================================== */
test('is_active=true + mot de passe correct => login accepté, jwt.sign appelé', async () => {
  resetState({
    loginRow: {
      account_id: 3, password_hash: 'x', email_verified: true, is_active: true,
      client_id: 44, first_name: 'Luc', last_name: 'Gagnon',
    },
    bcryptCompareResult: true,
  });
  const res = await callLogin();
  assert.strictEqual(res.statusCode, 200, `attendu 200, obtenu ${res.statusCode} (body: ${JSON.stringify(res.body)})`);
  assert.strictEqual(state.jwtSignCalls, 1, 'jwt.sign() aurait dû être appelé exactement une fois');
  assert.strictEqual(state.cookieSetCalls, 1, 'le cookie de session aurait dû être posé');
  assert.ok(res.body && res.body.client && res.body.client.id === 44, 'réponse client inattendue');
});

/* =====================================================================
   5. La comparaison du mot de passe n'est pas supprimée/contournée :
      un mot de passe erroné reste refusé, que le compte soit actif ou non
   ===================================================================== */
test('mot de passe incorrect + is_active=true => 401 (comparaison toujours appliquée)', async () => {
  resetState({
    loginRow: {
      account_id: 5, password_hash: 'x', email_verified: true, is_active: true,
      client_id: 46, first_name: 'A', last_name: 'B',
    },
    bcryptCompareResult: false,
  });
  const res = await callLogin();
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
  assert.strictEqual(state.bcryptCompareCalls, 1, 'bcrypt.compare() n\'a pas été appelé');
  assert.strictEqual(state.jwtSignCalls, 0, 'jwt.sign() appelé malgré un mot de passe invalide');
});

test('mot de passe incorrect + is_active=false => 401 (le gate is_active ne masque/ne remplace pas l\'échec du mot de passe)', async () => {
  resetState({
    loginRow: {
      account_id: 6, password_hash: 'x', email_verified: true, is_active: false,
      client_id: 47, first_name: 'C', last_name: 'D',
    },
    bcryptCompareResult: false,
  });
  const res = await callLogin();
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
  assert.strictEqual(state.bcryptCompareCalls, 1, 'bcrypt.compare() n\'a pas été appelé');
  assert.strictEqual(state.jwtSignCalls, 0, 'jwt.sign() appelé malgré un mot de passe invalide');
});

/* =====================================================================
   Bonus : compte inexistant => 401 générique, comportement inchangé
   ===================================================================== */
test('email inconnu => 401 générique, comportement de base inchangé', async () => {
  resetState({ loginRow: null });
  const res = await callLogin({ email: 'inconnu@example.com' });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(state.jwtSignCalls, 0);
});

/* =====================================================================
   RÉSUMÉ — les tests sont enregistrés via test(name, fn) puis exécutés
   séquentiellement (chacun awaité) par runTests().
   ===================================================================== */
runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
});
