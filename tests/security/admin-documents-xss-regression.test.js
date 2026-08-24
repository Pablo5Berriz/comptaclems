'use strict';

/**
 * STATIC + FUNCTIONAL SECURITY REGRESSION TEST — XSS-DOCLIST-001
 *
 * Cible : apps/web/public/assets-js/admin/adminDocuments.js, fonction renderDocuments().
 *
 * Contexte (audit COMPTACLEMS-CANONICAL-SECURITY-AUDIT-007A) :
 * doc.original_name, doc.client_name et doc.client_email étaient interpolés bruts
 * dans un template assigné à tbody.innerHTML — un client s'auto-inscrivant avec un
 * first_name/last_name malveillant, ou un original_name de document non filtré,
 * exécutait du JS dans le contexte du navigateur ADMIN (vol du JWT admin stocké en
 * localStorage). Ce test empêche toute régression sur ce sink précis.
 *
 * Ce test N'EXÉCUTE PAS de DOM/navigateur réel (zéro dépendance jsdom/jest/mocha,
 * cohérent avec les autres suites tests/security/ du projet). Il :
 *   1. vérifie statiquement, dans le code source réel, que les 3 champs concernés
 *      passent par escapeHtml(...) dans renderDocuments() et non plus bruts ;
 *   2. extrait la fonction escapeHtml() RÉELLEMENT définie dans le fichier audité
 *      (pas une réimplémentation du test) et l'exécute avec les payloads exigés par
 *      la directive 007B-P0, pour prouver que le sink neutralise bien le markup actif.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TARGET_FILE = path.join(
  __dirname,
  '..', '..',
  'apps', 'web', 'public', 'assets-js', 'admin', 'adminDocuments.js'
);

const source = fs.readFileSync(TARGET_FILE, 'utf8');

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
   1. PRÉSENCE — escapeHtml() est bien défini dans le fichier audité
   ===================================================================== */
test('escapeHtml(...) est défini dans adminDocuments.js', () => {
  assert.match(source, /function\s+escapeHtml\s*\(/, 'aucune définition de escapeHtml() trouvée');
});

/* =====================================================================
   2. LOCALISATION DU SINK — isoler le corps de renderDocuments()
   ===================================================================== */
const renderMatch = source.match(/function\s+renderDocuments\s*\([^)]*\)\s*\{([\s\S]*?)\n    \}/);
assert.ok(renderMatch, 'fonction renderDocuments() introuvable dans le fichier — le sink a peut-être été renommé/déplacé, test à mettre à jour');
const renderBody = renderMatch[1];

/* =====================================================================
   3. original_name / client_name / client_email : encodés dans le sink
   ===================================================================== */
test('doc.original_name est encodé via escapeHtml(...) dans renderDocuments()', () => {
  assert.match(renderBody, /escapeHtml\(\s*doc\.original_name\s*\)/, 'original_name toujours interpolé sans escapeHtml() dans le sink');
});

test('doc.client_name est encodé via escapeHtml(...) dans renderDocuments()', () => {
  assert.match(renderBody, /escapeHtml\(\s*doc\.client_name\s*\)/, 'client_name toujours interpolé sans escapeHtml() dans le sink');
});

test('doc.client_email est encodé via escapeHtml(...) dans renderDocuments()', () => {
  assert.match(renderBody, /escapeHtml\(\s*doc\.client_email\s*\)/, 'client_email toujours interpolé sans escapeHtml() dans le sink');
});

/* =====================================================================
   4. AUCUNE INTERPOLATION BRUTE RÉSIDUELLE des 3 champs dans le sink
   ===================================================================== */
test('original_name n\'est plus interpolé brut (sans escapeHtml) dans le sink', () => {
  // motif brut historique : ${doc.original_name || ...}  (sans escapeHtml() autour)
  const rawPattern = /\$\{\s*doc\.original_name\s*(\|\|[^}]*)?\}/;
  const m = renderBody.match(rawPattern);
  assert.ok(!m, `interpolation brute résiduelle trouvée : ${m && m[0]}`);
});

test('client_name n\'est plus interpolé brut (sans escapeHtml) dans le sink', () => {
  const rawPattern = /\$\{\s*doc\.client_name\s*(\|\|[^}]*)?\}/;
  const m = renderBody.match(rawPattern);
  assert.ok(!m, `interpolation brute résiduelle trouvée : ${m && m[0]}`);
});

test('client_email n\'est plus interpolé brut (sans escapeHtml) dans le sink', () => {
  const rawPattern = /\$\{\s*doc\.client_email\s*(\|\|[^}]*)?\}/;
  const m = renderBody.match(rawPattern);
  assert.ok(!m, `interpolation brute résiduelle trouvée : ${m && m[0]}`);
});

/* =====================================================================
   5. TEST FONCTIONNEL — extraire le VRAI escapeHtml() du fichier audité
      et l'exécuter avec les payloads exigés par la directive (pas une
      réimplémentation du test : on exécute le code réel)
   ===================================================================== */
const escapeFnMatch = source.match(/function\s+escapeHtml\s*\([\s\S]*?\n    \}/);
assert.ok(escapeFnMatch, 'corps de escapeHtml() introuvable pour extraction fonctionnelle');

// eslint-disable-next-line no-new-func
const escapeHtml = new Function(`${escapeFnMatch[0]}; return escapeHtml;`)();

test('escapeHtml() est bien une fonction exécutable extraite du fichier réel', () => {
  assert.strictEqual(typeof escapeHtml, 'function');
});

test('payload <img src=x onerror=alert(1)> ne produit plus de markup actif', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const out = escapeHtml(payload);
  assert.ok(!out.includes('<img'), `balise <img> encore présente après échappement : ${out}`);
  assert.ok(!/<[a-z]/i.test(out), `un tag HTML semble encore actif après échappement : ${out}`);
  assert.strictEqual(out, '&lt;img src=x onerror=alert(1)&gt;');
});

test('payload ">  neutralisé (fermeture d\'attribut + tag)', () => {
  const payload = '">';
  const out = escapeHtml(payload);
  assert.ok(!out.includes('"'), `guillemet double non échappé : ${out}`);
  assert.ok(!out.includes('>'), `chevron fermant non échappé : ${out}`);
  assert.strictEqual(out, '&quot;&gt;');
});

test("payload '><  neutralisé (fermeture d'attribut simple-quote + tag)", () => {
  const payload = "'><";
  const out = escapeHtml(payload);
  assert.ok(!out.includes("'"), `apostrophe non échappée : ${out}`);
  assert.ok(!out.includes('>') || out.includes('&gt;'), `chevron non échappé : ${out}`);
  assert.ok(!out.includes('<') || out.includes('&lt;'), `chevron ouvrant non échappé : ${out}`);
  assert.strictEqual(out, '&#039;&gt;&lt;');
});

test('payload & seul neutralisé (pas de double-échappement, pas d\'entité HTML forgeable)', () => {
  const out = escapeHtml('&');
  assert.strictEqual(out, '&amp;', `& doit devenir &amp; exactement, obtenu : ${out}`);
});

test('escapeHtml() gère une valeur vide/null/undefined sans lever d\'exception', () => {
  assert.strictEqual(escapeHtml(''), '');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

/* =====================================================================
   6. FICHIER NON MODIFIÉ HORS PÉRIMÈTRE — file_name (déjà safe, généré
      serveur) ne doit pas avoir été touché par erreur dans ce lot
   ===================================================================== */
test('doc.file_name (hors périmètre du lot) reste inchangé dans le sink', () => {
  assert.match(renderBody, /\$\{doc\.file_name \|\| ''\}/, 'doc.file_name a été modifié alors qu\'il était hors périmètre de 007B-P0');
});

/* =====================================================================
   RÉSUMÉ
   ===================================================================== */
console.log(`\n${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
