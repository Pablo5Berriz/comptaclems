-- ─── ComptaClems — Migration additive 001 ─────────────────────────────────────
-- Objet   : ajoute token_version (composant B de la révocation de sessions,
--           lot COMPTACLEMS-SESSION-REVOCATION-007F-B).
-- Portée  : additive uniquement. Ne modifie ni migration.sql ni migration_v2.sql.
-- Idempotence : ADD COLUMN IF NOT EXISTS — sûr à ré-exécuter (voir gate 007F-B0).
--
-- ORDRE DE DÉPLOIEMENT (obligatoire) :
--   1. appliquer cette migration (DB first)
--   2. vérifier les 2 colonnes présentes (voir postcheck ci-dessous)
--   3. déployer le code 007F-B
-- NE JAMAIS déployer le code 007F-B avant l'étape 1 : NEW CODE + OLD SCHEMA
-- (colonne absente) = erreur SQL à chaque requête authentifiée = panne
-- d'authentification totale (client et admin), pas une simple dégradation.
--
-- Portée d'exécution : script de schéma uniquement. Ne touche à aucune donnée
-- métier, aucune table hors client_accounts/admin, aucune ligne existante
-- au-delà de l'ajout de colonne (DEFAULT 1 appliqué automatiquement).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE comptaclems.client_accounts
ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE comptaclems.admin
ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

COMMIT;

-- ─── POSTCHECK (à exécuter manuellement après application, lecture seule) ─────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='comptaclems' AND table_name='client_accounts' AND column_name='token_version';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='comptaclems' AND table_name='admin' AND column_name='token_version';
-- SELECT count(*) FILTER (WHERE token_version IS NULL) FROM comptaclems.client_accounts; -- attendu 0
-- SELECT count(*) FILTER (WHERE token_version IS NULL) FROM comptaclems.admin;            -- attendu 0
