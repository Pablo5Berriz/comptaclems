'use strict';

/**
 * BEHAVIORAL TEST — COMPTACLEMS-007H (scheduledJobs.cancelJob / statut 'cancelled')
 *
 * Exécute le VRAI module apps/api/src/scheduledJobs.js (pas une réimplémentation),
 * avec db.js mocké via require.cache, pour confirmer que cancelJob() écrit bien
 * status = 'cancelled' et restreint la transition à WHERE status = 'pending'.
 *
 * Confirme également, par analyse statique des sources (grep), que cancelJob()
 * n'a aucun appelant actif ailleurs dans apps/ — classification DORMANT
 * FUNCTIONAL DEFECT pour le bug corrigé par la migration 002 : le défaut
 * existait dans le schéma (contrainte CHECK selon migration.sql) mais
 * n'était pas déclenchable en production tant que rien n'appelle cancelJob().
 *
 * Ce test NE se connecte à AUCUNE base de données réelle. Voir
 * POSTGRES_RUNTIME_TEST dans le rapport du lot pour la tentative de test
 * PostgreSQL temporaire (NOT_AVAILABLE : aucun serveur PostgreSQL
 * joignable dans cet environnement).
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');
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
const DB_PATH = path.join(ROOT, 'apps', 'api', 'src', 'db.js');
const SCHEDULED_JOBS_PATH = path.join(ROOT, 'apps', 'api', 'src', 'scheduledJobs.js');
const MAILER_PATH = path.join(ROOT, 'apps', 'api', 'src', 'services', 'mailer.js');

// ─── Mock db.js : capture les requêtes SQL sans se connecter à PostgreSQL ──────
const capturedQueries = [];
const mockDb = {
  query: async (sql, params) => {
    capturedQueries.push({ sql, params });
    return { rows: [{ id: 1 }] };
  },
};

// ─── Mock mailer.js : évite tout effet de bord SMTP ────────────────────────────
const mockMailer = {
  sendTestimonialRequestEmail: async () => {},
};

function loadScheduledJobsWithMocks() {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === DB_PATH) return mockDb;
    if (resolved === MAILER_PATH) return mockMailer;
    return originalLoad.apply(this, arguments);
  };

  delete require.cache[require.resolve(SCHEDULED_JOBS_PATH)];
  let mod;
  try {
    mod = require(SCHEDULED_JOBS_PATH);
  } finally {
    Module._load = originalLoad;
  }
  return mod;
}

test('cancelJob() existe et est exporté par scheduledJobs.js', () => {
  const mod = loadScheduledJobsWithMocks();
  assert.strictEqual(typeof mod.cancelJob, 'function', 'cancelJob doit être une fonction exportée');
});

test("cancelJob() écrit status = 'cancelled' en base (requête réelle interceptée)", async () => {
  capturedQueries.length = 0;
  const mod = loadScheduledJobsWithMocks();

  await mod.cancelJob(42);

  assert.strictEqual(capturedQueries.length, 1, `attendu 1 requête UPDATE, trouvé ${capturedQueries.length}`);
  const { sql, params } = capturedQueries[0];
  assert.ok(/UPDATE\s+comptaclems\.scheduled_jobs/i.test(sql), 'la requête ne cible pas comptaclems.scheduled_jobs');
  assert.ok(/SET\s+status\s*=\s*'cancelled'/i.test(sql), "la requête ne fixe pas status = 'cancelled'");
  assert.deepStrictEqual(params, [42], 'jobId attendu comme unique paramètre lié');
});

test("cancelJob() restreint la transition à WHERE status = 'pending' (pas de cancel d'un job déjà exécuté)", async () => {
  capturedQueries.length = 0;
  const mod = loadScheduledJobsWithMocks();

  await mod.cancelJob(7);

  const { sql } = capturedQueries[0];
  assert.ok(/WHERE\s+id\s*=\s*\$1\s+AND\s+status\s*=\s*'pending'/i.test(sql),
    "la requête doit restreindre la mise à jour aux jobs encore 'pending'");
});

test("cancelJob() est le seul point du code JS qui écrit comptaclems.scheduled_jobs.status = 'cancelled'", () => {
  // Scope : uniquement les fichiers .js, et uniquement les lignes qui
  // référencent scheduled_jobs ET 'cancelled' ensemble — 'cancelled' seul
  // est aussi une valeur légitime d'autres vocabulaires de statut non liés
  // (invoices, campaigns, déclarations fiscales) documentés séparément.
  const grep = execSync(
    `grep -rln --include=*.js "scheduled_jobs" apps/api/src apps/web/public/assets-js 2>/dev/null || true`,
    { cwd: ROOT }
  ).toString().split('\n').filter(Boolean);

  const offenders = [];
  for (const file of grep) {
    const full = path.join(ROOT, file);
    const lines = require('fs').readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (/scheduled_jobs/i.test(line) && /cancelled/i.test(line) && !file.endsWith('scheduledJobs.js')) {
        offenders.push(`${file}:${idx + 1}`);
      }
    });
  }
  assert.strictEqual(
    offenders.length, 0,
    `scheduled_jobs.status = 'cancelled' référencé en dehors de scheduledJobs.js : ${offenders.join(' | ')}`
  );
});

test('DORMANT FUNCTIONAL DEFECT : cancelJob() n\'a aucun appelant actif dans le code JS de apps/', () => {
  const grep = execSync(
    `grep -rn --include=*.js "cancelJob" apps/api/src apps/web/public/assets-js 2>/dev/null || true`,
    { cwd: ROOT }
  ).toString();
  const lines = grep.split('\n').filter(Boolean);
  // Lignes attendues : la définition (async function cancelJob) et l'export
  // (module.exports = { ..., cancelJob, ... }) dans scheduledJobs.js lui-même.
  const callers = lines.filter((l) =>
    !/scheduledJobs\.js:\d+:async function cancelJob/.test(l) &&
    !/scheduledJobs\.js:\d+:module\.exports/.test(l)
  );
  assert.strictEqual(
    callers.length, 0,
    `cancelJob() a un appelant actif — reclasser (pas DORMANT) : ${callers.join(' | ')}`
  );
});

runTests().then(() => {
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  console.log('\nNote : requêtes SQL interceptées via mock db.js (aucune connexion PostgreSQL réelle).');
  console.log('Voir POSTGRES_RUNTIME_TEST dans le rapport du lot pour la tentative de test temporaire réel.');
  if (failed > 0) process.exit(1);
});
