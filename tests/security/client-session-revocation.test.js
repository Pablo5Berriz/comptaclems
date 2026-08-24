'use strict';

/**
 * BEHAVIORAL SECURITY REGRESSION TEST — SESSION-REVOCATION-007F-A/007F-B (client)
 *
 * Cible : apps/api/src/middleware/authClient.js
 *   COMPOSANT A (007F-A) : après jwt.verify(), le compte (client_accounts)
 *   désigné par sub (clients.id) + aid (client_accounts.id) est revalidé en DB
 *   à chaque requête (existence, appartenance, is_active).
 *   COMPOSANT B (007F-B) : la même requête compare aussi payload.tv à
 *   client_accounts.token_version — révoque les sessions dont le mot de passe
 *   a changé depuis l'émission du JWT, même si le compte reste actif.
 *
 * Ce test exécute le VRAI middleware authClient.js (pas une réimplémentation),
 * avec db.js mocké via require.cache et de VRAIS JWT signés avec jsonwebtoken
 * (pour exercer aussi jwt.verify() réellement, pas seulement la logique DB).
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-a-real-credential';
const JWT_SECRET = process.env.JWT_SECRET;

const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'apps', 'api', 'src', 'db.js');
const AUTH_CLIENT_PATH = path.join(ROOT, 'apps', 'api', 'src', 'middleware', 'authClient.js');

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
   MOCK db.js — modélise fidèlement la requête réelle (007F-B) :
   SELECT ca.id, ca.client_id, ca.is_active, ca.token_version
   FROM comptaclems.client_accounts ca
   WHERE ca.id = $1 AND ca.client_id = $2
   ===================================================================== */
const state = {
  accountRow: null,   // { id, client_id, is_active, token_version } ou null
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
    if (/FROM comptaclems\.client_accounts/i.test(sql) && /ca\.id = \$1/.test(sql) && /ca\.client_id = \$2/.test(sql)) {
      if (state.dbError) throw new Error('simulated DB outage');
      const [aidParam, subParam] = params;
      if (
        state.accountRow &&
        state.accountRow.id === aidParam &&
        state.accountRow.client_id === subParam
      ) {
        return { rows: [state.accountRow] };
      }
      return { rows: [] };
    }
    return { rows: [] };
  },
});

const authClient = require(AUTH_CLIENT_PATH);

function resetState(overrides) {
  state.accountRow = null;
  state.dbError = false;
  Object.assign(state, overrides);
}

function makeReq({ cookieToken, path: reqPath = '/api/client/espace-client/whoami' } = {}) {
  return {
    path: reqPath,
    headers: { accept: 'application/json' },
    cookies: cookieToken ? { cc_auth: cookieToken } : {},
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    redirected: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(code, url) { this.redirected = { code, url }; return this; },
  };
  return res;
}

function signClientJwt(claims, opts = {}) {
  return jwt.sign({ type: 'client', ...claims }, JWT_SECRET, { expiresIn: '1d', ...opts });
}

async function callAuthClient(req, res) {
  let nextCalled = false;
  await authClient(req, res, () => { nextCalled = true; });
  return nextCalled;
}

/* =====================================================================
   1. Cas nominal : JWT valide + aid/sub valides + tv==DB + compte actif => next()
   ===================================================================== */
test('JWT valide + aid/sub cohérents + tv==DB + compte actif => next() appelé, req.client correctement peuplé', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 3 } });
  const token = signClientJwt({ sub: '42', aid: 501, tv: 3, email: 'a@b.com', first_name: 'Jean' });
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, true, 'next() aurait dû être appelé pour une session valide');
  assert.strictEqual(req.client.id, 42, 'req.client.id doit être clients.id (sub)');
  assert.strictEqual(req.clientId, 42, 'req.clientId doit être clients.id (sub)');
  assert.strictEqual(req.client.accountId, 501, 'req.client.accountId doit être client_accounts.id (aid)');
});

/* =====================================================================
   2. Claim aid manquant (JWT émis avant 007F-A) => refus, pas de repli
   ===================================================================== */
test("JWT valide mais SANS claim aid (ancien JWT pré-007F-A) => refus, aucun repli ambigu", async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } });
  const token = signClientJwt({ sub: '42', tv: 1, email: 'a@b.com' }); // pas de aid
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit jamais être appelé sans claim aid');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   3. aid ne correspond à aucune ligne (mauvais aid) => refus
   ===================================================================== */
test('aid ne correspond à aucun compte existant => refus (401)', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } });
  const token = signClientJwt({ sub: '42', aid: 999999, tv: 1 }); // aid inexistant
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit pas être appelé pour un aid inexistant');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   4. aid existe mais appartient à un AUTRE client (client_id différent) => refus
   ===================================================================== */
test("aid existe mais appartient à un autre client (client_id ≠ sub) => refus (401)", async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } }); // compte réel = client 42
  const token = signClientJwt({ sub: '43', aid: 501, tv: 1 }); // sub falsifié = 43, aid réel = 501 (client 42)
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'un aid appartenant à un autre client ne doit jamais passer');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   5. Compte inactif + tv cohérent => refus 403 (prouve que le check is_active
      fonctionne indépendamment du check tv, pas un faux-négatif dû à tv)
   ===================================================================== */
test('compte client désactivé (is_active=false) + tv==DB + JWT existant => refus (403)', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: false, token_version: 5 } });
  const token = signClientJwt({ sub: '42', aid: 501, tv: 5 });
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit pas être appelé pour un compte désactivé');
  assert.strictEqual(res.statusCode, 403, `attendu 403, obtenu ${res.statusCode}`);
  assert.ok(res.body && res.body.code === 'ACCOUNT_DISABLED', 'code ACCOUNT_DISABLED attendu');
});

/* =====================================================================
   6. Compte supprimé / inexistant (0 ligne pour cet aid+sub) => refus
   ===================================================================== */
test('compte client supprimé (aucune ligne client_accounts pour aid+sub) => refus (401)', async () => {
  resetState({ accountRow: null }); // aucune ligne, quel que soit aid/sub
  const token = signClientJwt({ sub: '42', aid: 501, tv: 1 });
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit pas être appelé pour un compte supprimé');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   7. Erreur DB pendant la revalidation => refus (fail-closed), jamais next()
   ===================================================================== */
test('erreur DB pendant la revalidation de session => refus (503), next() jamais appelé', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 }, dbError: true });
  const token = signClientJwt({ sub: '42', aid: 501, tv: 1 });
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit JAMAIS être appelé si la DB est indisponible');
  assert.strictEqual(res.statusCode, 503, `attendu 503, obtenu ${res.statusCode}`);
});

/* =====================================================================
   8. JWT invalide (signature erronée) => refus
   ===================================================================== */
test('JWT signé avec un secret différent (signature invalide) => refus (401)', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } });
  const forgedToken = jwt.sign({ sub: '42', aid: 501, tv: 1, type: 'client' }, 'wrong-secret-not-real', { expiresIn: '1d' });
  const req = makeReq({ cookieToken: forgedToken });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'un JWT à la signature invalide ne doit jamais passer');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   9. Aucun cookie => refus (comportement pré-existant, non-régression)
   ===================================================================== */
test('aucun cookie cc_auth => refus (401), comportement inchangé', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } });
  const req = makeReq({ cookieToken: null });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

/* =====================================================================
   10. [007F-B] Claim tv manquant (JWT émis avant 007F-B, aid présent) => refus
   ===================================================================== */
test('JWT valide + aid présent mais SANS claim tv (JWT pré-007F-B) => refus (401), force relogin', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } });
  const token = signClientJwt({ sub: '42', aid: 501 }); // pas de tv
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'next() ne doit jamais être appelé sans claim tv');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   11. [007F-B] tv du JWT ne correspond pas à token_version en DB => refus
   ===================================================================== */
test('tv du JWT (1) != token_version DB (2) => refus (401)', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 2 } });
  const token = signClientJwt({ sub: '42', aid: 501, tv: 1 }); // JWT émis avant le dernier changement de mdp
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'un tv obsolète ne doit jamais passer');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

/* =====================================================================
   12. [007F-B] Scénario réaliste : token_version incrémenté en DB APRÈS
       l'émission du JWT (ex. changement de mot de passe) => la session
       déjà émise est bloquée à la requête suivante
   ===================================================================== */
test('token_version incrémenté en DB après émission du JWT (changement de mdp) => session déjà émise bloquée', async () => {
  // Étape 1 : JWT émis quand token_version valait 1 (login normal)
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } });
  const tokenEmisAvant = signClientJwt({ sub: '42', aid: 501, tv: 1 });

  // Vérifie que ce JWT fonctionnait bien à ce moment-là
  const reqAvant = makeReq({ cookieToken: tokenEmisAvant });
  const resAvant = makeRes();
  assert.strictEqual(await callAuthClient(reqAvant, resAvant), true, 'le JWT devait être valide avant le changement de mdp');

  // Étape 2 : changement de mot de passe → token_version passe à 2 en DB
  // (même requête que le nouveau JWT, mais l'ancien JWT n'est jamais réémis)
  state.accountRow = { id: 501, client_id: 42, is_active: true, token_version: 2 };

  // Étape 3 : la MÊME session (ancien cookie, tv=1) est maintenant rejetée
  const reqApres = makeReq({ cookieToken: tokenEmisAvant });
  const resApres = makeRes();
  const nextCalled = await callAuthClient(reqApres, resApres);

  assert.strictEqual(nextCalled, false, 'la session émise avant le changement de mdp doit être révoquée');
  assert.strictEqual(resApres.statusCode, 401, `attendu 401, obtenu ${resApres.statusCode}`);
});

/* =====================================================================
   13. [007F-B] tv non numérique => refus
   ===================================================================== */
test('tv non numérique dans le JWT => refus (401)', async () => {
  resetState({ accountRow: { id: 501, client_id: 42, is_active: true, token_version: 1 } });
  const token = signClientJwt({ sub: '42', aid: 501, tv: 'not-a-number' });
  const req = makeReq({ cookieToken: token });
  const res = makeRes();

  const nextCalled = await callAuthClient(req, res);

  assert.strictEqual(nextCalled, false, 'un tv non numérique ne doit jamais passer');
  assert.strictEqual(res.statusCode, 401, `attendu 401, obtenu ${res.statusCode}`);
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
});
