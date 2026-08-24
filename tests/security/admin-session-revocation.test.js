'use strict';

/**
 * BEHAVIORAL SECURITY REGRESSION TEST — SESSION-REVOCATION-007F-A/007F-B (admin)
 *
 * Cible : apps/api/src/middleware/authAdmin.js
 *   COMPOSANT A (007F-A) : après jwt.verify(), l'admin désigné par payload.sub
 *   est revalidé en DB à chaque requête (existence, is_active, ET role).
 *   req.admin.role provient TOUJOURS de la ligne DB, jamais du claim JWT
 *   payload.role — ferme le gap de rôle périmé identifié au lot 007E.
 *   COMPOSANT B (007F-B) : la même requête compare aussi payload.tv à
 *   admin.token_version — révoque les sessions dont le mot de passe ou la
 *   configuration 2FA a changé depuis l'émission du JWT, même si le compte
 *   reste actif et le rôle inchangé.
 *
 * Ce test exécute le VRAI middleware authAdmin.js (pas une réimplémentation), avec
 * db.js mocké via require.cache et de VRAIS JWT signés avec jsonwebtoken.
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-a-real-credential';
const JWT_SECRET = process.env.JWT_SECRET;

const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'apps', 'api', 'src', 'db.js');
const AUTH_ADMIN_PATH = path.join(ROOT, 'apps', 'api', 'src', 'middleware', 'authAdmin.js');

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
   MOCK db.js — modélise fidèlement (007F-B) :
   SELECT id, is_active, role, email, token_version FROM comptaclems.admin WHERE id = $1
   ===================================================================== */
const state = {
  adminRow: null,   // { id, is_active, role, email, token_version } ou null
  dbError: false,
};

function fakeModule(exports) {
  const m = new Module('mock', null);
  m.exports = exports;
  m.loaded = true;
  return m;
}

require.cache[require.resolve(DB_PATH)] = fakeModule({
  query: async (sql, params) => {
    if (/FROM comptaclems\.admin/i.test(sql) && /WHERE id = \$1/i.test(sql)) {
      if (state.dbError) throw new Error('simulated DB outage');
      const [idParam] = params;
      if (state.adminRow && state.adminRow.id === idParam) {
        return { rows: [state.adminRow] };
      }
      return { rows: [] };
    }
    return { rows: [] };
  },
});

const authAdmin = require(AUTH_ADMIN_PATH);

function resetState(overrides) {
  state.adminRow = null;
  state.dbError = false;
  Object.assign(state, overrides);
}

function makeReq(bearerToken) {
  return {
    headers: bearerToken ? { authorization: `Bearer ${bearerToken}` } : {},
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function signAdminJwt(claims, opts = {}) {
  return jwt.sign({ type: 'admin', ...claims }, JWT_SECRET, { expiresIn: '7d', ...opts });
}

async function callAuthAdmin(req, res) {
  let nextCalled = false;
  await authAdmin(req, res, () => { nextCalled = true; });
  return nextCalled;
}

/* =====================================================================
   1. Admin actif + JWT valide + tv==DB => next(), req.admin.role vient de la DB
   ===================================================================== */
test('admin actif + JWT valide + tv==DB => next() appelé, req.admin peuplé depuis la DB', async () => {
  resetState({ adminRow: { id: 7, is_active: true, role: 'admin', email: 'x@y.com', token_version: 4 } });
  const token = signAdminJwt({ sub: 7, role: 'admin', email: 'x@y.com', tv: 4 });
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, true, 'next() aurait dû être appelé');
  assert.strictEqual(req.admin.id, 7);
  assert.strictEqual(req.admin.role, 'admin');
});

/* =====================================================================
   2. Admin désactivé + tv cohérent + JWT existant => refus (403)
      (prouve que le check is_active fonctionne indépendamment du check tv)
   ===================================================================== */
test('admin désactivé (is_active=false) + tv==DB + JWT existant => refus (403)', async () => {
  resetState({ adminRow: { id: 8, is_active: false, role: 'admin', email: 'x@y.com', token_version: 1 } });
  const token = signAdminJwt({ sub: 8, role: 'admin', tv: 1 });
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit pas être appelé pour un admin désactivé');
  assert.strictEqual(res.statusCode, 403, `attendu 403, obtenu ${res.statusCode}`);
});

/* =====================================================================
   3. Admin supprimé (0 ligne) + JWT existant => refus (401)
   ===================================================================== */
test('admin supprimé (aucune ligne DB pour sub) + JWT existant => refus (401)', async () => {
  resetState({ adminRow: null });
  const token = signAdminJwt({ sub: 9, role: 'superadmin', tv: 1 });
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit pas être appelé pour un admin supprimé');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   4. Rôle rétrogradé en DB + tv cohérent : le JWT dit superadmin, la DB dit
      support => req.admin.role doit être 'support' (jamais le claim JWT périmé)
   ===================================================================== */
test('JWT role=superadmin mais DB role=support (rétrogradé) + tv==DB => req.admin.role == support', async () => {
  resetState({ adminRow: { id: 10, is_active: true, role: 'support', email: 'x@y.com', token_version: 2 } });
  const token = signAdminJwt({ sub: 10, role: 'superadmin', tv: 2 }); // ancien JWT, rôle périmé
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, true, 'la requête doit être acceptée (le compte reste actif et tv cohérent)');
  assert.strictEqual(req.admin.role, 'support', 'req.admin.role doit refléter la DB, pas le claim JWT périmé (superadmin)');
  assert.notStrictEqual(req.admin.role, 'superadmin', 'le rôle périmé du JWT ne doit jamais fuiter dans req.admin.role');
});

/* =====================================================================
   5. Erreur DB => refus (fail-closed), jamais next()
   ===================================================================== */
test('erreur DB pendant la revalidation => refus (503), next() jamais appelé', async () => {
  resetState({ adminRow: { id: 7, is_active: true, role: 'admin', email: 'x@y.com', token_version: 1 }, dbError: true });
  const token = signAdminJwt({ sub: 7, role: 'admin', tv: 1 });
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit JAMAIS être appelé si la DB est indisponible');
  assert.strictEqual(res.statusCode, 503, `attendu 503, obtenu ${res.statusCode}`);
});

/* =====================================================================
   6. JWT invalide (signature erronée) => refus
   ===================================================================== */
test('JWT signé avec un secret différent (signature invalide) => refus (401)', async () => {
  resetState({ adminRow: { id: 7, is_active: true, role: 'admin', email: 'x@y.com', token_version: 1 } });
  const forgedToken = jwt.sign({ sub: 7, role: 'superadmin', type: 'admin', tv: 1 }, 'wrong-secret-not-real', { expiresIn: '7d' });
  const req = makeReq(forgedToken);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false, 'un JWT à la signature invalide ne doit jamais passer');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   7. Aucun header Authorization => refus (comportement pré-existant)
   ===================================================================== */
test('aucun header Authorization => refus (401), comportement inchangé', async () => {
  resetState({ adminRow: { id: 7, is_active: true, role: 'admin', email: 'x@y.com', token_version: 1 } });
  const req = makeReq(null);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

/* =====================================================================
   8. [007F-B] Claim tv manquant (JWT émis avant 007F-B) => refus
   ===================================================================== */
test('JWT valide mais SANS claim tv (JWT pré-007F-B) => refus (401), force relogin', async () => {
  resetState({ adminRow: { id: 7, is_active: true, role: 'admin', email: 'x@y.com', token_version: 1 } });
  const token = signAdminJwt({ sub: 7, role: 'admin' }); // pas de tv
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit jamais être appelé sans claim tv');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   9. [007F-B] version mismatch => refus (401)
   ===================================================================== */
test('tv du JWT (1) != token_version DB (2) => refus (401)', async () => {
  resetState({ adminRow: { id: 7, is_active: true, role: 'admin', email: 'x@y.com', token_version: 2 } });
  const token = signAdminJwt({ sub: 7, role: 'admin', tv: 1 }); // JWT émis avant le dernier changement de mdp/2FA
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false, 'un tv obsolète ne doit jamais passer');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   10. [007F-B] tv non numérique => refus
   ===================================================================== */
test('tv non numérique dans le JWT admin => refus (401)', async () => {
  resetState({ adminRow: { id: 7, is_active: true, role: 'admin', email: 'x@y.com', token_version: 1 } });
  const token = signAdminJwt({ sub: 7, role: 'admin', tv: 'not-a-number' });
  const req = makeReq(token);
  const res = makeRes();

  const nextCalled = await callAuthAdmin(req, res);

  assert.strictEqual(nextCalled, false, 'un tv non numérique ne doit jamais passer');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
});
