'use strict';

/**
 * Tests de régression sécurité — P0-A (reset-password token hashing).
 *
 * Portée : vérification STATIQUE du code source des 3 fichiers concernés.
 * Pas de suite de tests (jest/mocha/...) dans ce dépôt (voir package.json) —
 * aucune dépendance nouvelle n'a été ajoutée pour rester dans le périmètre
 * du lot 006A. Ce script s'exécute directement avec Node, sans DB, sans réseau :
 *
 *   node tests/security/reset-password-hardening.test.js
 *
 * Ce que ce test NE couvre PAS : comportement runtime réel contre une vraie
 * base de données (nécessite un environnement de test DB — voir roadmap lot 010).
 * Chaque assertion ci-dessous vérifie une propriété de sécurité observable
 * directement dans le code source, sans exécuter de requête DB.
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

const ROOT = path.join(__dirname, '..', '..');
const forgotSrc = fs.readFileSync(
  path.join(ROOT, 'apps/api/src/routes/client/forgot-password.js'),
  'utf8'
);
const resetSrc = fs.readFileSync(
  path.join(ROOT, 'apps/api/src/routes/client/reset-password.js'),
  'utf8'
);
const authAccountSrc = fs.readFileSync(
  path.join(ROOT, 'apps/api/src/routes/client/authAccount.js'),
  'utf8'
);

console.log('\n=== forgot-password.js ===');

check('hashToken() existe et utilise SHA-256', () => {
  assert.match(forgotSrc, /function\s+hashToken\s*\(/);
  assert.match(forgotSrc, /createHash\(\s*['"]sha256['"]\s*\)/);
});

check('le token brut est haché avant insertion en DB', () => {
  assert.match(forgotSrc, /const\s+tokenHash\s*=\s*hashToken\(\s*rawToken\s*\)/);
});

check('INSERT utilise tokenHash (jamais rawToken directement)', () => {
  const insertMatch = forgotSrc.match(
    /INSERT INTO comptaclems\.password_reset_tokens[\s\S]*?VALUES[\s\S]*?\)/
  );
  assert.ok(insertMatch, "requête INSERT introuvable dans forgot-password.js");
  // Le tableau de paramètres passé juste après doit référencer tokenHash, pas rawToken
  const afterInsert = forgotSrc.slice(insertMatch.index, insertMatch.index + insertMatch[0].length + 120);
  assert.match(afterInsert, /\[\s*clientId\s*,\s*tokenHash\s*,\s*expiresAt\s*\]/);
});

check('les anciens tokens actifs du client sont invalidés avant création', () => {
  assert.match(
    forgotSrc,
    /UPDATE comptaclems\.password_reset_tokens SET used = TRUE WHERE client_id = \$1 AND used = FALSE/
  );
});

check('un TTL est appliqué (RESET_TOKEN_TTL_MINUTES)', () => {
  assert.match(forgotSrc, /RESET_TOKEN_TTL_MINUTES/);
  assert.match(forgotSrc, /expiresAt\s*=\s*new Date\(/);
});

check('aucun console.log/error n\'imprime rawToken ou tokenHash', () => {
  const logLines = forgotSrc.match(/console\.(log|error|warn|info)\([^)]*\)/g) || [];
  for (const line of logLines) {
    assert.ok(
      !/rawToken|tokenHash/.test(line),
      `ligne de log expose potentiellement le token : ${line}`
    );
  }
});

console.log('\n=== reset-password.js ===');

check('hashToken() existe et utilise SHA-256', () => {
  assert.match(resetSrc, /function\s+hashToken\s*\(/);
  assert.match(resetSrc, /createHash\(\s*['"]sha256['"]\s*\)/);
});

check('le token entrant est haché AVANT le lookup DB (POST /)', () => {
  const postHandler = resetSrc.slice(resetSrc.indexOf("router.post('/'"));
  const hashIdx = postHandler.search(/const\s+tokenHash\s*=\s*hashToken\(\s*rawToken\s*\)/);
  const queryIdx = postHandler.search(/FROM comptaclems\.password_reset_tokens/);
  assert.ok(hashIdx !== -1, 'hashage du token introuvable dans le handler POST /');
  assert.ok(queryIdx !== -1, 'requête de lookup introuvable dans le handler POST /');
  assert.ok(hashIdx < queryIdx, 'le hash doit être calculé avant la requête de lookup');
});

check('le lookup compare sur la colonne token (hash), pas sur un token en clair', () => {
  assert.match(
    resetSrc,
    /WHERE\s+token\s*=\s*\$1\s+AND\s+used\s*=\s*FALSE/
  );
});

check('isStrongEnough() est appelé avant toute opération DB', () => {
  const postHandler = resetSrc.slice(resetSrc.indexOf("router.post('/'"));
  const strongIdx = postHandler.search(/isStrongEnough\(\s*password\s*\)/);
  const dbIdx = postHandler.search(/db\.query\(/);
  assert.ok(strongIdx !== -1, 'appel à isStrongEnough introuvable');
  assert.ok(dbIdx !== -1, 'aucun appel db.query trouvé après isStrongEnough');
  assert.ok(strongIdx < dbIdx, 'la validation du mot de passe doit précéder les requêtes DB');
});

check('tous les tokens actifs du client sont invalidés après reset réussi', () => {
  assert.match(
    resetSrc,
    /UPDATE comptaclems\.password_reset_tokens SET used = TRUE WHERE client_id = \$1/
  );
});

check('l\'expiration est vérifiée (expires_at comparé à la date courante)', () => {
  assert.match(resetSrc, /new Date\(\)\s*>\s*new Date\(\s*tokenData\.expires_at\s*\)/);
});

check('aucun console.log/error n\'imprime rawToken/tokenHash/password', () => {
  const logLines = resetSrc.match(/console\.(log|error|warn|info)\([^)]*\)/g) || [];
  for (const line of logLines) {
    assert.ok(
      !/rawToken|tokenHash|\bpassword\b/.test(line),
      `ligne de log expose potentiellement une donnée sensible : ${line}`
    );
  }
});

console.log('\n=== authAccount.js ===');

check('la route /forgot-password délègue au module dédié (pas de handler dupliqué en clair)', () => {
  assert.match(authAccountSrc, /router\.use\(\s*['"]\/forgot-password['"]\s*,\s*require\(\s*['"]\.\/forgot-password['"]\s*\)\s*\)/);
});

check('la route /reset-password délègue au module dédié (pas de handler dupliqué en clair)', () => {
  assert.match(authAccountSrc, /router\.use\(\s*['"]\/reset-password['"]\s*,\s*require\(\s*['"]\.\/reset-password['"]\s*\)\s*\)/);
});

check('aucun vestige du flux legacy en texte clair (reset_token / reset_token_expires_at)', () => {
  assert.ok(
    !/reset_token_expires_at/.test(authAccountSrc),
    'colonne legacy reset_token_expires_at encore référencée — flux en clair possiblement dupliqué'
  );
});

console.log(`\n${passed} PASS, ${failures} FAIL\n`);
process.exitCode = failures > 0 ? 1 : 0;
