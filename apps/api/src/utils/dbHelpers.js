'use strict';

/**
 * dbHelpers.js — Helpers d'introspection DB partagés et mis en cache
 *
 * Remplace les copies dupliquées de columnExists/tableExists/safeCount
 * présentes dans clients.js et dashboard.js.
 *
 * Cache TTL : 5 min en mémoire.
 * Note : en mode PM2 cluster, chaque instance a son propre cache —
 * acceptable car les données n'évoluent pas en cours d'exécution.
 */

const db = require('../db');

const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function _cacheSet(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Vérifie si une table existe (ex: 'comptaclems.clients') */
async function tableExists(fullName) {
  const cached = _cacheGet(`table:${fullName}`);
  if (cached !== undefined) return cached;

  const r = await db.query('SELECT to_regclass($1) AS reg', [fullName]);
  const exists = !!r.rows?.[0]?.reg;
  _cacheSet(`table:${fullName}`, exists);
  return exists;
}

/** Vérifie si une colonne existe dans une table */
async function columnExists(schemaName, tableName, columnName) {
  const key = `col:${schemaName}.${tableName}.${columnName}`;
  const cached = _cacheGet(key);
  if (cached !== undefined) return cached;

  const r = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    [schemaName, tableName, columnName]
  );
  const exists = r.rowCount > 0;
  _cacheSet(key, exists);
  return exists;
}

/** Compte les lignes d'une table (0 si la table n'existe pas) */
async function safeCount(fullName, whereSql = '') {
  const exists = await tableExists(fullName);
  if (!exists) return 0;
  const r = await db.query(`SELECT COUNT(*)::int AS n FROM ${fullName} ${whereSql}`);
  return r.rows?.[0]?.n ?? 0;
}

/** Compte selon deux conditions dans la même passe */
async function safeCountTwo(fullName, conditionA, conditionB) {
  const exists = await tableExists(fullName);
  if (!exists) return { a: 0, b: 0 };

  const r = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${conditionA})::int AS a,
      COUNT(*) FILTER (WHERE ${conditionB})::int AS b
    FROM ${fullName}
  `);
  return r.rows?.[0] ?? { a: 0, b: 0 };
}

/** Retourne le premier nom de table existant parmi une liste de candidats */
async function pickFirstExistingTable(candidates) {
  for (const fullName of candidates) {
    if (await tableExists(fullName)) return fullName;
  }
  return null;
}

/** Décompose 'schema.table' en { schema, table } */
function splitFullName(fullName) {
  if (!fullName || typeof fullName !== 'string') return { schema: null, table: null };
  const parts = fullName.split('.');
  return { schema: parts[0] || null, table: parts[1] || null };
}

/** Compte par groupe (ex: GROUP BY status) */
async function safeCountByGroup(fullName, groupColumn) {
  const exists = await tableExists(fullName);
  if (!exists) return {};

  const { schema, table } = splitFullName(fullName);
  if (schema && table) {
    const hasColumn = await columnExists(schema, table, groupColumn);
    if (!hasColumn) return {};
  }

  try {
    const r = await db.query(
      `SELECT ${groupColumn}, COUNT(*)::int AS count FROM ${fullName} GROUP BY ${groupColumn}`
    );
    const result = {};
    r.rows.forEach(row => { result[row[groupColumn]] = row.count; });
    return result;
  } catch (err) {
    console.error(`[dbHelpers] safeCountByGroup(${fullName}):`, err.message);
    return {};
  }
}

/** Invalide le cache (utile après migrations en dev) */
function invalidateCache() {
  _cache.clear();
}

module.exports = {
  tableExists,
  columnExists,
  safeCount,
  safeCountTwo,
  pickFirstExistingTable,
  splitFullName,
  safeCountByGroup,
  invalidateCache,
};
