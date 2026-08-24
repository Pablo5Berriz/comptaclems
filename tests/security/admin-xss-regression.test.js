'use strict';

/**
 * Test de régression sécurité — P0-B (Admin XSS via fileName/onclick/JWT).
 *
 * Portée : vérification STATIQUE du code source d'adminDeclarations.js.
 * Pas de suite de tests DOM (jest+jsdom) dans ce dépôt — aucune dépendance
 * nouvelle n'a été ajoutée pour rester dans le périmètre du lot 006A.
 * Ce script s'exécute directement avec Node, sans navigateur, sans DB :
 *
 *   node tests/security/admin-xss-regression.test.js
 *
 * Ce que ce test NE couvre PAS : exécution réelle en navigateur d'un payload
 * fileName malveillant (nécessiterait jsdom/Puppeteer — non installés ici,
 * voir roadmap lot 010 pour la fondation de tests complète).
 *
 * Pattern vulnérable original (confirmé présent dans le HEAD canonique
 * GitHub 1da1b18cbf5e492aa19ec5e56a81f7e07590bee4, apps/web/public/assets-js/
 * admin/adminDeclarations.js, fonction generateDocumentsList) :
 *
 *   <button onclick="downloadDocument(${docId}, '${fileName}', '${token}')">
 *
 * fileName vient de doc.name (nom de fichier téléversé par un CLIENT, donc
 * potentiellement hostile) et était concaténé SANS échappement dans un
 * contexte d'attribut onclick exécutable → évasion de la chaîne JS possible
 * via une apostrophe dans le nom de fichier. Le JWT admin (token) était
 * injecté en clair dans le HTML généré (visible via view-source / DOM).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let failures = 0;
let passed = 0;

function check(description, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${description}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${description}`);
    console.log(`        ${err.message}`);
  }
}

const FILE = path.join(
  __dirname, '..', '..',
  'apps/web/public/assets-js/admin/adminDeclarations.js'
);
const src = fs.readFileSync(FILE, 'utf8');

console.log('\n=== adminDeclarations.js — XSS (fileName/onclick/JWT) ===');

check('le pattern vulnérable onclick="previewDocument(${docId}, \'${token}\')" est absent', () => {
  assert.ok(
    !src.includes("onclick=\"previewDocument(${docId}, '${token}')\""),
    'pattern vulnérable encore présent (JWT interpolé dans onclick)'
  );
});

check('le pattern vulnérable onclick="downloadDocument(${docId}, \'${fileName}\', \'${token}\')" est absent', () => {
  assert.ok(
    !src.includes("onclick=\"downloadDocument(${docId}, '${fileName}', '${token}')\""),
    'pattern vulnérable encore présent (fileName + JWT interpolés dans onclick)'
  );
});

check('aucun onclick=" ne contient plus fileName ni token de manière générale', () => {
  const onclickWithVars = src.match(/onclick="[^"]*\$\{[^}]*(fileName|token)[^}]*\}[^"]*"/g);
  assert.ok(
    !onclickWithVars,
    `onclick avec interpolation fileName/token trouvé : ${JSON.stringify(onclickWithVars)}`
  );
});

check('generateDocumentsList() ne prend plus token en paramètre', () => {
  assert.match(src, /function\s+generateDocumentsList\s*\(\s*documents\s*\)\s*\{/);
  assert.ok(
    !/function\s+generateDocumentsList\s*\(\s*documents\s*,\s*token\s*\)/.test(src),
    'generateDocumentsList prend encore token en paramètre'
  );
});

check('generateAdminDocumentsView() ne prend plus token en paramètre', () => {
  assert.match(src, /function\s+generateAdminDocumentsView\s*\(\s*documents\s*,\s*declarationId\s*\)\s*\{/);
});

check('docId et fileName passent par des data-attributes échappés (escapeHtml)', () => {
  assert.match(src, /data-doc-id="\$\{escapeHtml\(String\(docId\)\)\}"/);
  assert.match(src, /data-filename="\$\{escapeHtml\(fileName\)\}"/);
});

check('les boutons preview/download utilisent addEventListener, pas onclick', () => {
  assert.match(src, /doc-preview-btn/);
  assert.match(src, /doc-download-btn/);
  assert.match(src, /querySelectorAll\(\s*['"]\.doc-preview-btn['"]\s*\)[\s\S]*?addEventListener\(\s*['"]click['"]/);
  assert.match(src, /querySelectorAll\(\s*['"]\.doc-download-btn['"]\s*\)[\s\S]*?addEventListener\(\s*['"]click['"]/);
});

check('le JWT n\'est plus jamais écrit dans le HTML généré — relu depuis localStorage au clic', () => {
  assert.match(src, /function getAdminToken\s*\(/);
  assert.match(src, /localStorage\.getItem\(\s*['"]cc_admin_auth['"]\s*\)/);
  // Le template docsHtml (généré côté serveur/client puis document.write) ne doit
  // plus jamais contenir une variable "token" interpolée directement.
  const generateDocsListBody = src.slice(
    src.indexOf('function generateDocumentsList'),
    src.indexOf('function generateEmptyDocuments')
  );
  // La seule occurrence de "token" autorisée dans ce bloc est dans le <script>
  // injecté (getAdminToken / var token = getAdminToken()), jamais dans les
  // template strings HTML construites avant le <script>.
  const htmlPartBeforeScript = generateDocsListBody.slice(0, generateDocsListBody.indexOf('<script>'));
  assert.ok(
    !/\$\{\s*token\s*\}/.test(htmlPartBeforeScript),
    'une interpolation ${token} subsiste dans le HTML généré avant le <script>'
  );
});

console.log(`\n${passed} PASS, ${failures} FAIL\n`);
process.exitCode = failures > 0 ? 1 : 0;
