-- ─── ComptaClems — Migration additive 002 ─────────────────────────────────────
-- Objet   : corrige la contrainte CHECK de comptaclems.scheduled_jobs.status
--           pour autoriser 'cancelled' (lot COMPTACLEMS-007H).
--
-- Contexte : migration.sql (CREATE TABLE IF NOT EXISTS) définit
--   CHECK (status IN ('pending','running','done','failed'))  -- sans 'cancelled'
-- migration_v2.sql (CREATE TABLE IF NOT EXISTS, même table) définit
--   CHECK (status IN ('pending','running','done','failed','cancelled'))
-- Comme les deux utilisent CREATE TABLE IF NOT EXISTS sur la même table,
-- seule la contrainte issue du script exécuté EN PREMIER est réellement en
-- vigueur. Si c'est migration.sql, cancelJob() (apps/api/src/scheduledJobs.js)
-- écrit UPDATE ... SET status = 'cancelled' et cette écriture est rejetée par
-- PostgreSQL (violation de contrainte CHECK).
--
-- Portée  : additive/corrective uniquement sur comptaclems.scheduled_jobs.
--           Ne modifie ni migration.sql ni migration_v2.sql ni aucune autre
--           table, colonne ou donnée existante.
-- Idempotence : identifie dynamiquement la contrainte CHECK existante sur la
--           colonne status via pg_constraint, la supprime si trouvée, puis
--           recrée une contrainte équivalente autorisant exactement
--           pending / running / done / failed / cancelled. Sûr à ré-exécuter :
--           un second passage retrouve la contrainte qu'il vient de créer,
--           la supprime et la recrée à l'identique (aucune erreur, aucun
--           changement d'état).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  v_conname text;
BEGIN
  -- No-op si la table n'existe pas dans cet environnement.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comptaclems' AND c.relname = 'scheduled_jobs'
  ) THEN
    RETURN;
  END IF;

  -- Supprime toute contrainte CHECK existante portant sur la colonne status
  -- (nom auto-généré par Postgres ou nom explicite selon la migration source).
  FOR v_conname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comptaclems'
      AND c.relname = 'scheduled_jobs'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE comptaclems.scheduled_jobs DROP CONSTRAINT %I', v_conname);
  END LOOP;

  ALTER TABLE comptaclems.scheduled_jobs
    ADD CONSTRAINT scheduled_jobs_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled'));
END $$;

COMMIT;

-- ─── POSTCHECK (à exécuter manuellement après application, lecture seule) ─────
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'comptaclems.scheduled_jobs'::regclass AND contype = 'c';
-- -- attendu : une seule ligne, definition contenant 'cancelled'
-- SELECT count(*) FROM comptaclems.scheduled_jobs; -- attendu : inchangé (aucune ligne perdue)
