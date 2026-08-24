'use strict';

/**
 * SECURITY REGRESSION TEST — TOKEN-IN-URL-001
 *
 * Cibles :
 *  - apps/api/src/routes/admin/declarations.js, route
 *    GET /documents/:docId/download (montée sous /api/admin/declarations)
 *  - apps/web/public/assets-js/admin/adminDocuments.js, window.downloadDocument()
 *
 * Contexte (audit 007A) : le JWT admin transitait par une query string
 * (?token=...) côté frontend, et une route backend réimplémentait sa propre
 * vérification JWT en acceptant req.query.token en fallback — au lieu
 * d'utiliser le middleware partagé authAdmin. Un JWT dans une URL fuit par
 * l'historique navigateur, les logs serveur/proxy et le header Referer.
 *
 * Note (007D-P1B) : la revalidation du problème a montré que la route
 * réellement appelée par adminDocuments.js (routes/admin/documents.js) était
 * déjà protégée exclusivement par authAdmin (header only, sans fallback
 * query) — c'est le fallback query.token de declarations.js (route DISTINCTE,
 * utilisée par les documents de déclaration) et l'exposition du token dans
 * l'URL frontend qui constituaient le risque réel. Les deux sont corrigés
 * indépendamment ici.
 *
 * Ce test :
 *  1. vérifie STRUCTURELLEMENT (pas un grep superficiel) que la route de
 *     téléchargement utilise la VRAIE référence de fonction authAdmin comme
 *     premier middleware de sa chaîne (router.stack réel) ;
 *  2. exécute RÉELLEMENT ce middleware (le vrai authAdmin, pas une
 *     réimplémentation) sans header Authorization et prouve qu'il refuse
 *     (401, next() jamais appelé) ;
 *  3. vérifie statiquement, dans le corps réel de la route, l'absence de
 *     req.query.token / jwt.verify local, et la présence de la logique
 *     métier existante (lookup + res.sendFile) ;
 *  4. vérifie statiquement, dans le corps réel de window.downloadDocument(),
 *     l'absence de token dans l'URL et la présence du pattern
 *     fetch + Authorization + Blob + object URL + <a download> + revoke.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-a-real-credential';

const ROOT = path.join(__dirname, '..', '..');
const DECLARATIONS_PATH = path.join(ROOT, 'apps', 'api', 'src', 'routes', 'admin', 'declarations.js');
const AUTH_ADMIN_PATH = path.join(ROOT, 'apps', 'api', 'src', 'middleware', 'authAdmin.js');
const ADMIN_DOCUMENTS_JS_PATH = path.join(ROOT, 'apps', 'web', 'public', 'assets-js', 'admin', 'adminDocuments.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

/* =====================================================================
   BACKEND — chargement du VRAI router et du VRAI middleware authAdmin
   ===================================================================== */
const authAdmin = require(AUTH_ADMIN_PATH);
const router = require(DECLARATIONS_PATH);

function findRouteLayer(method, routePath) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === routePath) {
      const methodLayers = layer.route.stack.filter((s) => s.method === method.toLowerCase());
      if (methodLayers.length) return { route: layer.route, stack: methodLayers };
    }
  }
  throw new Error(`Route ${method} ${routePath} introuvable dans declarations.js`);
}

const downloadRoute = findRouteLayer('get', '/documents/:docId/download');

test('la route GET /documents/:docId/download utilise la référence réelle du middleware authAdmin', () => {
  const handles = downloadRoute.route.stack.map((s) => s.handle);
  assert.ok(handles.length >= 2, `attendu au moins 2 handlers (authAdmin + handler métier), obtenu ${handles.length}`);
  assert.ok(
    handles.includes(authAdmin),
    "la fonction authAdmin réellement importée n'apparaît pas dans la chaîne de la route"
  );
});

test('authAdmin est le PREMIER handler de la route (exécuté avant toute logique métier)', () => {
  const handles = downloadRoute.route.stack.map((s) => s.handle);
  assert.strictEqual(handles[0], authAdmin, 'authAdmin doit être le premier middleware de la route');
});

test('authAdmin (tel que réellement branché sur cette route) refuse une requête sans header Authorization', () => {
  const authHandler = downloadRoute.route.stack[0].handle;
  let nextCalled = false;
  let statusCode = null;
  let jsonBody = null;
  const req = { headers: {} };
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { jsonBody = body; return this; },
  };
  authHandler(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false, "next() a été appelé sans authentification — contournement possible");
  assert.strictEqual(statusCode, 401, `attendu 401, obtenu ${statusCode}`);
  assert.ok(jsonBody && jsonBody.success === false, 'réponse 401 inattendue');
});

test("authAdmin (tel que réellement branché sur cette route) refuse aussi un ?token= en query string", () => {
  const authHandler = downloadRoute.route.stack[0].handle;
  let nextCalled = false;
  let statusCode = null;
  const req = { headers: {}, query: { token: 'fake.jwt.token' } };
  const res = {
    status(code) { statusCode = code; return this; },
    json() { return this; },
  };
  authHandler(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false, 'un token en query string a été accepté — fallback non supprimé');
  assert.strictEqual(statusCode, 401, `attendu 401, obtenu ${statusCode}`);
});

/* =====================================================================
   BACKEND — analyse statique du corps réel de la route (source exacte)
   ===================================================================== */
const backendSource = fs.readFileSync(DECLARATIONS_PATH, 'utf8');
const downloadFnMatch = backendSource.match(
  /router\.get\('\/documents\/:docId\/download',\s*authAdmin,\s*async\s*\(req,\s*res\)\s*=>\s*\{([\s\S]*?)\n\}\);/
);
assert.ok(downloadFnMatch, 'corps de la route de téléchargement introuvable dans declarations.js — la route a peut-être été renommée/déplacée, test à mettre à jour');
const downloadFnBody = downloadFnMatch[1];

test("req.query.token n'est plus référencé dans le corps de la route", () => {
  assert.ok(!/req\.query\.token/.test(downloadFnBody), 'req.query.token encore présent — fallback query string non supprimé');
});

test("aucun jwt.verify local n'est présent dans le corps de la route (auth déléguée à authAdmin)", () => {
  assert.ok(!/jwt\.verify/.test(downloadFnBody), 'jwt.verify() encore appelé localement — réimplémentation non supprimée');
});

test("le module jsonwebtoken n'est plus importé dans declarations.js (devenu inutile après la correction)", () => {
  assert.ok(!/require\(['"]jsonwebtoken['"]\)/.test(backendSource), "require('jsonwebtoken') encore présent dans le fichier");
});

test('la logique métier de téléchargement (lookup tax_documents + res.sendFile) est préservée', () => {
  assert.match(downloadFnBody, /FROM comptaclems\.tax_documents/, 'le lookup du document a disparu');
  assert.match(downloadFnBody, /res\.sendFile\(abs\)/, "l'envoi du fichier (res.sendFile) a disparu");
});

/* =====================================================================
   FRONTEND — analyse statique du corps réel de window.downloadDocument()
   ===================================================================== */
const frontendSource = fs.readFileSync(ADMIN_DOCUMENTS_JS_PATH, 'utf8');
const downloadFrontendMatch = frontendSource.match(
  /window\.downloadDocument\s*=\s*async function\s*\(documentId\)\s*\{([\s\S]*?)\n    \};/
);
assert.ok(downloadFrontendMatch, 'window.downloadDocument introuvable dans adminDocuments.js pour analyse statique — la fonction a peut-être été renommée/déplacée');
const downloadFrontendBody = downloadFrontendMatch[1];

test("adminDocuments.js ne construit plus d'URL contenant ?token=... ou &token=...", () => {
  assert.ok(!/\?token=\$\{/.test(downloadFrontendBody), 'un ?token=${...} est encore construit');
  assert.ok(!/&token=\$\{/.test(downloadFrontendBody), 'un &token=${...} est encore construit');
  assert.ok(!/window\.open\(/.test(downloadFrontendBody), 'window.open() encore utilisé pour le téléchargement (ancien mécanisme)');
});

test('le téléchargement utilise fetch()', () => {
  assert.match(downloadFrontendBody, /fetch\(/, 'aucun appel fetch() trouvé');
});

test('le header Authorization: Bearer <token> est envoyé via fetch', () => {
  assert.match(
    downloadFrontendBody,
    /['"]Authorization['"]\s*:\s*`Bearer \$\{auth\.token\}`/,
    'header Authorization Bearer introuvable dans les options de fetch()'
  );
});

test('la réponse est convertie en Blob', () => {
  assert.match(downloadFrontendBody, /\.blob\(\)/, 'aucune conversion .blob() trouvée');
});

test('un object URL est créé puis révoqué (URL.createObjectURL / URL.revokeObjectURL)', () => {
  assert.match(downloadFrontendBody, /URL\.createObjectURL\(/, 'URL.createObjectURL introuvable');
  assert.match(downloadFrontendBody, /URL\.revokeObjectURL\(/, 'URL.revokeObjectURL introuvable');
});

test('le téléchargement passe par un <a download> temporaire, pas par innerHTML', () => {
  assert.match(downloadFrontendBody, /link\.download\s*=/, "element.download non utilisé pour poser le nom de fichier");
  assert.ok(!/innerHTML/.test(downloadFrontendBody), 'innerHTML utilisé dans le flux de téléchargement');
});

test('les erreurs (401/403/404/réseau) sont gérées sans jamais logger/exposer le JWT', () => {
  assert.match(downloadFrontendBody, /401/, 'cas 401 non géré explicitement');
  assert.match(downloadFrontendBody, /404/, 'cas 404 non géré explicitement');
  assert.ok(!/console\.(log|error)\([^)]*auth\.token/.test(downloadFrontendBody), 'le token semble être loggé en cas d\'erreur');
  assert.ok(!/alert\([^)]*auth\.token/.test(downloadFrontendBody), 'le token semble être exposé via alert()');
});

/* =====================================================================
   RÉSUMÉ
   ===================================================================== */
console.log(`\n${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
