'use strict';

/**
 * STATIC TEST — SESSION-REVOCATION-007F-B (migration token_version)
 *
 * Vérifie STATIQUEMENT le contenu du fichier
 * apps/api/src/scripts/migrations/001_add_token_version.sql, et que
 * migration.sql / migration_v2.sql n'ont pas été modifiés par ce lot.
 *
 * Ce test NE se connecte à AUCUNE base de données et NE prétend PAS valider
 * que le script s'exécute réellement contre PostgreSQL — voir le rapport du
 * lot pour MIGRATION_RUNTIME_TEST (aucun PostgreSQL temporaire disponible
 * dans cet environnement).
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { execSync } = require('child_process');

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

const ROOT = path.join(__dirname, '..', '..');
const MIGRATION_FILE = path.join(
  ROOT, 'apps', 'api', 'src', 'scripts', 'migrations', '001_add_token_version.sql'
);
const MIGRATION_SQL = path.join(ROOT, 'apps', 'api', 'src', 'scripts', 'migration.sql');
const MIGRATION_V2_SQL = path.join(ROOT, 'apps', 'api', 'src', 'scripts', 'migration_v2.sql');

test('001_add_token_version.sql existe', () => {
  assert.ok(fs.existsSync(MIGRATION_FILE), `fichier introuvable : ${MIGRATION_FILE}`);
});

const content = fs.existsSync(MIGRATION_FILE) ? fs.readFileSync(MIGRATION_FILE, 'utf8') : '';

test('contient BEGIN et COMMIT (transaction explicite)', () => {
  assert.ok(/\bBEGIN\s*;/i.test(content), 'BEGIN; absent');
  assert.ok(/\bCOMMIT\s*;/i.test(content), 'COMMIT; absent');
  const beginIdx = content.search(/\bBEGIN\s*;/i);
  const commitIdx = content.search(/\bCOMMIT\s*;/i);
  assert.ok(beginIdx >= 0 && commitIdx > beginIdx, 'COMMIT doit suivre BEGIN');
});

test('ALTER TABLE comptaclems.client_accounts ADD COLUMN IF NOT EXISTS token_version présent', () => {
  const re = /ALTER TABLE\s+comptaclems\.client_accounts\s+ADD COLUMN IF NOT EXISTS\s+token_version\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/i;
  assert.ok(re.test(content), 'ALTER TABLE client_accounts ... token_version introuvable ou incorrect');
});

test('ALTER TABLE comptaclems.admin ADD COLUMN IF NOT EXISTS token_version présent', () => {
  const re = /ALTER TABLE\s+comptaclems\.admin\s+ADD COLUMN IF NOT EXISTS\s+token_version\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/i;
  assert.ok(re.test(content), 'ALTER TABLE admin ... token_version introuvable ou incorrect');
});

test('les 2 ALTER TABLE sont dans la transaction BEGIN...COMMIT', () => {
  const beginIdx = content.search(/\bBEGIN\s*;/i);
  const commitIdx = content.search(/\bCOMMIT\s*;/i);
  const clientAlterIdx = content.search(/ALTER TABLE\s+comptaclems\.client_accounts/i);
  const adminAlterIdx = content.search(/ALTER TABLE\s+comptaclems\.admin/i);
  assert.ok(clientAlterIdx > beginIdx && clientAlterIdx < commitIdx, 'ALTER client_accounts hors transaction');
  assert.ok(adminAlterIdx > beginIdx && adminAlterIdx < commitIdx, 'ALTER admin hors transaction');
});

test('IF NOT EXISTS présent sur les 2 ALTER TABLE (idempotence)', () => {
  // Ne compte que dans le code SQL exécutable (lignes hors commentaires --),
  // le fichier mentionne aussi "IF NOT EXISTS" une fois dans son en-tête commenté.
  const codeOnly = content
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const occurrences = (codeOnly.match(/ADD COLUMN IF NOT EXISTS/gi) || []).length;
  assert.strictEqual(occurrences, 2, `attendu 2 occurrences de "ADD COLUMN IF NOT EXISTS" en code SQL, trouvé ${occurrences}`);
});

test('INTEGER NOT NULL DEFAULT 1 présent exactement 2 fois', () => {
  const occurrences = (content.match(/INTEGER\s+NOT NULL\s+DEFAULT\s+1/gi) || []).length;
  assert.strictEqual(occurrences, 2, `attendu 2 occurrences, trouvé ${occurrences}`);
});

test('aucune instruction destructive (DROP/DELETE/TRUNCATE) dans le fichier', () => {
  assert.ok(!/\bDROP\b/i.test(content), 'DROP trouvé — inattendu dans une migration additive');
  assert.ok(!/\bDELETE\b/i.test(content), 'DELETE trouvé — inattendu dans une migration additive');
  assert.ok(!/\bTRUNCATE\b/i.test(content), 'TRUNCATE trouvé — inattendu dans une migration additive');
});

const BASE_SHA = 'ef267f1df7e79c4ac415b7a351ea4e48c2302c99';

test('migration.sql n\'a pas été modifié depuis la baseline 007F-A (git diff vide)', () => {
  let diff;
  try {
    diff = execSync(
      `git diff ${BASE_SHA} -- ${JSON.stringify(path.relative(ROOT, MIGRATION_SQL))}`,
      { cwd: ROOT }
    ).toString().trim();
  } catch (e) {
    throw new Error(`git diff a échoué : ${e.message}`);
  }
  assert.strictEqual(diff, '', `migration.sql apparaît modifié depuis ${BASE_SHA} : "${diff}"`);
});

test('migration_v2.sql n\'a pas été modifié depuis la baseline 007F-A (git diff vide)', () => {
  let diff;
  try {
    diff = execSync(
      `git diff ${BASE_SHA} -- ${JSON.stringify(path.relative(ROOT, MIGRATION_V2_SQL))}`,
      { cwd: ROOT }
    ).toString().trim();
  } catch (e) {
    throw new Error(`git diff a échoué : ${e.message}`);
  }
  assert.strictEqual(diff, '', `migration_v2.sql apparaît modifié depuis ${BASE_SHA} : "${diff}"`);
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  console.log('\nNote : test STATIQUE uniquement (analyse du fichier .sql et du diff Git).');
  console.log('Ne teste PAS l\'exécution réelle contre PostgreSQL. Voir MIGRATION_RUNTIME_TEST dans le rapport du lot.');
  if (failed > 0) process.exit(1);
});
