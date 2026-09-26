'use strict';

/**
 * STATIC TEST — COMPTACLEMS-007H (migration scheduled_jobs status CHECK)
 *
 * Vérifie STATIQUEMENT le contenu du fichier
 * apps/api/src/scripts/migrations/002_fix_scheduled_jobs_status_check.sql,
 * et que migration.sql / migration_v2.sql / 001_add_token_version.sql n'ont
 * pas été modifiés par ce lot.
 *
 * Ce test NE se connecte à AUCUNE base de données et NE prétend PAS valider
 * que le script s'exécute réellement contre PostgreSQL — voir
 * POSTGRES_RUNTIME_TEST dans le rapport du lot (aucun serveur PostgreSQL
 * disponible/joignable dans cet environnement : pg_isready échoue, aucun
 * binaire pg_ctl/initdb présent).
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
  ROOT, 'apps', 'api', 'src', 'scripts', 'migrations', '002_fix_scheduled_jobs_status_check.sql'
);
const MIGRATION_SQL = path.join(ROOT, 'apps', 'api', 'src', 'scripts', 'migration.sql');
const MIGRATION_V2_SQL = path.join(ROOT, 'apps', 'api', 'src', 'scripts', 'migration_v2.sql');
const MIGRATION_001 = path.join(
  ROOT, 'apps', 'api', 'src', 'scripts', 'migrations', '001_add_token_version.sql'
);

test('002_fix_scheduled_jobs_status_check.sql existe', () => {
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

test('cible uniquement comptaclems.scheduled_jobs (aucune autre table)', () => {
  const otherTables = ['client_accounts', 'admin', 'invoices', 'messages', 'notifications',
    'testimonials', 'taxes', 'documents', 'marketing_campaigns'];
  for (const t of otherTables) {
    assert.ok(
      !new RegExp(`ALTER TABLE\\s+comptaclems\\.${t}\\b`, 'i').test(content),
      `le script modifie ${t}, hors périmètre`
    );
  }
  assert.ok(/comptaclems\.scheduled_jobs/i.test(content), 'scheduled_jobs absent du script');
});

test('identifie la contrainte dynamiquement via pg_constraint (pas de nom codé en dur unique)', () => {
  assert.ok(/pg_constraint/i.test(content), 'pg_constraint absent — la contrainte doit être trouvée dynamiquement');
  assert.ok(/pg_get_constraintdef/i.test(content), 'pg_get_constraintdef absent');
});

test('la nouvelle contrainte autorise exactement pending/running/done/failed/cancelled', () => {
  const re = /CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'running'\s*,\s*'done'\s*,\s*'failed'\s*,\s*'cancelled'\s*\)\s*\)/i;
  assert.ok(re.test(content), 'contrainte CHECK attendue introuvable ou incomplète');
});

test('ne modifie aucune autre colonne (aucun ADD/DROP COLUMN, aucun ALTER COLUMN)', () => {
  assert.ok(!/ADD COLUMN/i.test(content), 'ADD COLUMN trouvé — hors scope (statut uniquement)');
  assert.ok(!/DROP COLUMN/i.test(content), 'DROP COLUMN trouvé — hors scope');
  assert.ok(!/ALTER COLUMN/i.test(content), 'ALTER COLUMN trouvé — hors scope');
});

test('aucune instruction destructive (DROP TABLE/DELETE/TRUNCATE) dans le fichier', () => {
  assert.ok(!/\bDROP TABLE\b/i.test(content), 'DROP TABLE trouvé — inattendu dans une migration correctrice de contrainte');
  assert.ok(!/\bDELETE\b/i.test(content), 'DELETE trouvé — inattendu');
  assert.ok(!/\bTRUNCATE\b/i.test(content), 'TRUNCATE trouvé — inattendu');
});

test('structure idempotente : la contrainte trouvée est supprimée avant d\'être recréée', () => {
  const dropIdx = content.search(/DROP CONSTRAINT/i);
  const addIdx = content.search(/ADD CONSTRAINT/i);
  assert.ok(dropIdx >= 0, 'DROP CONSTRAINT (dynamique) absent');
  assert.ok(addIdx > dropIdx, 'ADD CONSTRAINT doit suivre la suppression dynamique');
});

const BASE_SHA = '4c8d543da2a5b2066c65749690d8321606743a79';

for (const [label, file] of [
  ['migration.sql', MIGRATION_SQL],
  ['migration_v2.sql', MIGRATION_V2_SQL],
  ['001_add_token_version.sql', MIGRATION_001],
]) {
  test(`${label} n'a pas été modifié depuis la baseline 007H (git diff vide)`, () => {
    let diff;
    try {
      diff = execSync(
        `git diff ${BASE_SHA} -- ${JSON.stringify(path.relative(ROOT, file))}`,
        { cwd: ROOT }
      ).toString().trim();
    } catch (e) {
      throw new Error(`git diff a échoué : ${e.message}`);
    }
    assert.strictEqual(diff, '', `${label} apparaît modifié depuis ${BASE_SHA} : "${diff}"`);
  });
}

test('scheduledJobs.js n\'a pas été modifié depuis la baseline 007H (git diff vide)', () => {
  const SCHEDULED_JOBS_JS = path.join(ROOT, 'apps', 'api', 'src', 'scheduledJobs.js');
  let diff;
  try {
    diff = execSync(
      `git diff ${BASE_SHA} -- ${JSON.stringify(path.relative(ROOT, SCHEDULED_JOBS_JS))}`,
      { cwd: ROOT }
    ).toString().trim();
  } catch (e) {
    throw new Error(`git diff a échoué : ${e.message}`);
  }
  assert.strictEqual(diff, '', `scheduledJobs.js apparaît modifié depuis ${BASE_SHA} : "${diff}"`);
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  console.log('\nNote : test STATIQUE uniquement (analyse du fichier .sql et du diff Git).');
  console.log('Ne teste PAS l\'exécution réelle contre PostgreSQL. Voir POSTGRES_RUNTIME_TEST dans le rapport du lot.');
  if (failed > 0) process.exit(1);
});
