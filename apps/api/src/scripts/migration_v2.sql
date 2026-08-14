-- ============================================================
--  ComptaClems — Migration corrective v2
--  Auteur : analyse automatique du dump (2026-03-29)
--  But    : synchroniser la BD avec le code backend à 100%
--
--  ORDRE D'EXÉCUTION : psql -U postgres -d <votre_db> -f migration_v2.sql
-- ============================================================

SET search_path TO comptaclems, public;

-- ─────────────────────────────────────────────────────────────
-- 1. TABLE admin : colonnes 2FA manquantes
-- ─────────────────────────────────────────────────────────────
ALTER TABLE comptaclems.admin
  ADD COLUMN IF NOT EXISTS totp_secret      TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret_temp TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled     BOOLEAN NOT NULL DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────
-- 2. TABLE testimonials : migration is_published → status
--    La colonne is_published (bool) est remplacée par status
--    (varchar: pending | published | rejected)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE comptaclems.testimonials
  ADD COLUMN IF NOT EXISTS status VARCHAR(20);

-- Peupler status depuis is_published si status est NULL
UPDATE comptaclems.testimonials
SET status = CASE
  WHEN is_published IS TRUE  THEN 'published'
  WHEN is_published IS FALSE THEN 'pending'
  ELSE 'pending'
END
WHERE status IS NULL;

-- Appliquer valeur par défaut et contrainte
ALTER TABLE comptaclems.testimonials
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;

-- Ajouter les colonnes manquantes pour les campagnes d'invitation
ALTER TABLE comptaclems.testimonials
  ADD COLUMN IF NOT EXISTS source          VARCHAR(30) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS invite_token    VARCHAR(128),
  ADD COLUMN IF NOT EXISTS invite_sent_at  TIMESTAMPTZ;

-- Index unique sur invite_token pour les liens d'invitation
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonials_invite_token
  ON comptaclems.testimonials(invite_token)
  WHERE invite_token IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. TABLE invoices (paiements Interac)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.invoices (
  id             BIGSERIAL PRIMARY KEY,
  client_id      BIGINT NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  invoice_number VARCHAR(30) UNIQUE,
  amount         NUMERIC(10,2) NOT NULL,
  description    TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','cancelled')),
  due_date       DATE,
  paid_at        TIMESTAMPTZ,
  created_by     BIGINT REFERENCES comptaclems.admin(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON comptaclems.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status    ON comptaclems.invoices(status);

-- ─────────────────────────────────────────────────────────────
-- 4. TABLE messages (messagerie client ↔ comptable)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.messages (
  id           BIGSERIAL PRIMARY KEY,
  client_id    BIGINT NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  sender_type  VARCHAR(10) NOT NULL CHECK (sender_type IN ('client','admin')),
  subject      VARCHAR(255),
  body         TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_client_id ON comptaclems.messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read   ON comptaclems.messages(client_id, is_read);

-- Colonnes manquantes dans le schéma v2 (requises par le backend)
ALTER TABLE comptaclems.messages
  ADD COLUMN IF NOT EXISTS admin_id   BIGINT REFERENCES comptaclems.admin(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- 5. TABLE notifications (SSE / cloche de notification)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.notifications (
  id         BIGSERIAL PRIMARY KEY,
  client_id  BIGINT NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,
  title      VARCHAR(255),
  body       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON comptaclems.notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON comptaclems.notifications(client_id, is_read);

-- ─────────────────────────────────────────────────────────────
-- 6. TABLE scheduled_jobs (persistance des cron jobs)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.scheduled_jobs (
  id         BIGSERIAL PRIMARY KEY,
  type       VARCHAR(80) NOT NULL,
  payload    JSONB DEFAULT '{}',
  run_at     TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','running','done','failed','cancelled')),
  result     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON comptaclems.scheduled_jobs(status, run_at);

-- ─────────────────────────────────────────────────────────────
-- 7. TABLE tax_spouse_snapshot (conjoint, snapshot de déclaration)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.tax_spouse_snapshot (
  id            BIGSERIAL PRIMARY KEY,
  tax_file_id   BIGINT NOT NULL REFERENCES comptaclems.taxes(id) ON DELETE CASCADE,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  date_of_birth DATE,
  nas_hash      VARCHAR(128),
  nas_encrypted TEXT,
  email         VARCHAR(255),
  phone         VARCHAR(30),
  same_address  BOOLEAN DEFAULT TRUE,
  address       TEXT,
  city          VARCHAR(100),
  province      VARCHAR(10),
  postal_code   VARCHAR(20),
  canada_status VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_spouse_snapshot_tax_file_id
  ON comptaclems.tax_spouse_snapshot(tax_file_id);

-- ─────────────────────────────────────────────────────────────
-- 8. TABLE tax_dependents_snapshot (enfants à charge)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.tax_dependents_snapshot (
  id            BIGSERIAL PRIMARY KEY,
  tax_file_id   BIGINT NOT NULL REFERENCES comptaclems.taxes(id) ON DELETE CASCADE,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  date_of_birth DATE,
  nas_hash      VARCHAR(128),
  nas_encrypted TEXT,
  relationship  VARCHAR(30) DEFAULT 'enfant',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_dependents_snapshot_tax_file_id
  ON comptaclems.tax_dependents_snapshot(tax_file_id);

-- ─────────────────────────────────────────────────────────────
-- 9. TABLE tax_incomes_snapshot (revenus par source)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.tax_incomes_snapshot (
  id           BIGSERIAL PRIMARY KEY,
  tax_file_id  BIGINT NOT NULL REFERENCES comptaclems.taxes(id) ON DELETE CASCADE,
  person_role  VARCHAR(20) NOT NULL DEFAULT 'client',
  type_code    VARCHAR(50) NOT NULL,
  has_income   BOOLEAN DEFAULT FALSE,
  quantity     INTEGER DEFAULT 0,
  details      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_incomes_snapshot_tax_file_id
  ON comptaclems.tax_incomes_snapshot(tax_file_id);

-- ─────────────────────────────────────────────────────────────
-- 10. TABLE tax_expenses_snapshot (dépenses déductibles)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.tax_expenses_snapshot (
  id           BIGSERIAL PRIMARY KEY,
  tax_file_id  BIGINT NOT NULL REFERENCES comptaclems.taxes(id) ON DELETE CASCADE,
  category     VARCHAR(50) NOT NULL,
  applicable_to VARCHAR(20) DEFAULT 'client',
  amount       NUMERIC(10,2),
  details      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_expenses_snapshot_tax_file_id
  ON comptaclems.tax_expenses_snapshot(tax_file_id);

-- ─────────────────────────────────────────────────────────────
-- 11. TABLE tax_status_history (historique des changements de statut)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.tax_status_history (
  id         BIGSERIAL PRIMARY KEY,
  tax_id     BIGINT NOT NULL REFERENCES comptaclems.taxes(id) ON DELETE CASCADE,
  old_status VARCHAR(30),
  status     VARCHAR(30) NOT NULL,
  changed_by BIGINT,
  note       TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_status_history_tax_id
  ON comptaclems.tax_status_history(tax_id);

-- ─────────────────────────────────────────────────────────────
-- 12. TABLE marketing_campaigns (campagnes email)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.marketing_campaigns (
  id                BIGSERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  type              VARCHAR(30) NOT NULL DEFAULT 'testimonial_request'
                      CHECK (type IN ('testimonial_request','newsletter','promotion','custom')),
  subject           VARCHAR(255) NOT NULL,
  body_html         TEXT NOT NULL,
  body_text         TEXT,
  target_audience   VARCHAR(30) NOT NULL DEFAULT 'all_clients'
                      CHECK (target_audience IN ('all_clients','completed_declarations','specific_clients','manual_list')),
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled')),
  scheduled_at      TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  created_by        BIGINT REFERENCES comptaclems.admin(id),
  total_recipients  INTEGER DEFAULT 0,
  sent_count        INTEGER DEFAULT 0,
  open_count        INTEGER DEFAULT 0,
  click_count       INTEGER DEFAULT 0,
  error_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON comptaclems.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type   ON comptaclems.marketing_campaigns(type);

-- ─────────────────────────────────────────────────────────────
-- 13. TABLE campaign_recipients (destinataires d'une campagne)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.campaign_recipients (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  BIGINT NOT NULL REFERENCES comptaclems.marketing_campaigns(id) ON DELETE CASCADE,
  client_id    BIGINT REFERENCES comptaclems.clients(id) ON DELETE SET NULL,
  email        VARCHAR(255) NOT NULL,
  name         VARCHAR(200),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','sent','bounced','unsubscribed')),
  invite_token VARCHAR(128),
  sent_at      TIMESTAMPTZ,
  opened_at    TIMESTAMPTZ,
  clicked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id
  ON comptaclems.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email
  ON comptaclems.campaign_recipients(email);

-- ─────────────────────────────────────────────────────────────
-- 14. Triggers updated_at (nouvelles tables)
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  -- invoices
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_invoices_updated_at'
  ) THEN
    CREATE TRIGGER set_invoices_updated_at
      BEFORE UPDATE ON comptaclems.invoices
      FOR EACH ROW EXECUTE FUNCTION comptaclems.set_updated_at();
  END IF;

  -- scheduled_jobs
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_scheduled_jobs_updated_at'
  ) THEN
    CREATE TRIGGER set_scheduled_jobs_updated_at
      BEFORE UPDATE ON comptaclems.scheduled_jobs
      FOR EACH ROW EXECUTE FUNCTION comptaclems.set_updated_at();
  END IF;

  -- marketing_campaigns
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_campaigns_updated_at'
  ) THEN
    CREATE TRIGGER set_campaigns_updated_at
      BEFORE UPDATE ON comptaclems.marketing_campaigns
      FOR EACH ROW EXECUTE FUNCTION comptaclems.set_updated_at();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 15. Vue pratique v_client_summary (mise à jour)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW comptaclems.v_client_summary AS
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.canada_status,
  c.type,
  ca.email_verified,
  ca.last_login_at,
  t.id             AS latest_tax_id,
  t.fiscal_year    AS latest_fiscal_year,
  t.status         AS latest_tax_status,
  t.dossier_number,
  COUNT(DISTINCT inv.id) FILTER (WHERE inv.status = 'pending') AS invoices_pending,
  COUNT(DISTINCT msg.id) FILTER (WHERE msg.is_read = FALSE AND msg.sender_type = 'client') AS messages_unread
FROM comptaclems.clients c
LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
LEFT JOIN LATERAL (
  SELECT id, fiscal_year, status, dossier_number
  FROM comptaclems.taxes
  WHERE client_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) t ON TRUE
LEFT JOIN comptaclems.invoices inv ON inv.client_id = c.id
LEFT JOIN comptaclems.messages  msg ON msg.client_id = c.id
GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone,
         c.canada_status, c.type, ca.email_verified, ca.last_login_at,
         t.id, t.fiscal_year, t.status, t.dossier_number;

-- ─────────────────────────────────────────────────────────────
-- 16. NETTOYAGE : supprimer les tables dupliquées du schéma public
--     (public.admin, public.client_accounts, public.clients,
--      public.tax_people, public.taxes)
--     Ces tables sont des artéfacts d'une ancienne migration.
--     L'application utilise exclusivement comptaclems.*
--     ⚠️  Décommentez uniquement si vous êtes sûr qu'aucune
--     application externe ne les utilise.
-- ─────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.tax_people CASCADE;
-- DROP TABLE IF EXISTS public.taxes     CASCADE;
-- DROP TABLE IF EXISTS public.client_accounts CASCADE;
-- DROP TABLE IF EXISTS public.clients   CASCADE;
-- DROP TABLE IF EXISTS public.admin     CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Fin de la migration v2
-- ─────────────────────────────────────────────────────────────
SELECT 'Migration v2 appliquée avec succès ✓' AS result;
