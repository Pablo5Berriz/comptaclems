-- ─── ComptaClems — Script de migration complet ───────────────────────────────
-- Version : 2.0
-- Date    : 2026-03-29
-- Auteur  : ComptaClems
--
-- Ce script applique toutes les migrations nécessaires de manière idempotente
-- (CREATE IF NOT EXISTS, ALTER TABLE ADD COLUMN IF NOT EXISTS)
-- Il est SAFE à exécuter plusieurs fois.
-- ─────────────────────────────────────────────────────────────────────────────

-- Schéma principal
CREATE SCHEMA IF NOT EXISTS comptaclems;

-- ─── TABLE admin ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.admin (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  role            VARCHAR(50) NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('superadmin', 'admin', 'support')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colonnes 2FA (ajoutées si absentes)
ALTER TABLE comptaclems.admin ADD COLUMN IF NOT EXISTS totp_secret      TEXT;
ALTER TABLE comptaclems.admin ADD COLUMN IF NOT EXISTS totp_secret_temp TEXT;
ALTER TABLE comptaclems.admin ADD COLUMN IF NOT EXISTS totp_enabled     BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── TABLE clients ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.clients (
  id              SERIAL PRIMARY KEY,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  phone           VARCHAR(50),
  canada_status   VARCHAR(50) NOT NULL DEFAULT 'resident',
  marital_status  VARCHAR(50),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ
);

-- ─── TABLE client_accounts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.client_accounts (
  id                     SERIAL PRIMARY KEY,
  client_id              INTEGER NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  email                  VARCHAR(255) NOT NULL UNIQUE,
  password_hash          TEXT NOT NULL,
  email_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  reset_token            TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  last_login_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ
);

-- ─── TABLE taxes (déclarations fiscales) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.taxes (
  id                      SERIAL PRIMARY KEY,
  client_id               INTEGER NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  fiscal_year             INTEGER NOT NULL,
  submission_type         VARCHAR(50),
  declaration_conjointe   BOOLEAN DEFAULT FALSE,
  spouse_id               INTEGER,
  first_declaration       BOOLEAN DEFAULT FALSE,
  has_children            BOOLEAN DEFAULT FALSE,
  children_count          INTEGER DEFAULT 0,
  province_snapshot       VARCHAR(10),
  canada_status_snapshot  VARCHAR(50),
  status                  VARCHAR(50) NOT NULL DEFAULT 'brouillon'
                          CHECK (status IN ('brouillon', 'recu', 'en_traitement', 'documents_manquants', 'terminee', 'refusee')),
  amount                  DECIMAL(10, 2),
  payment_reference       VARCHAR(100),
  dossier_number          VARCHAR(50),
  intake_payload          JSONB,
  submitted_at            TIMESTAMPTZ,
  started_at              TIMESTAMPTZ,
  current_step            INTEGER DEFAULT 1,
  nas_hash_client         TEXT,
  nas_hash_conjoint       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ
);

-- ─── TABLE tax_documents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.tax_documents (
  id                 SERIAL PRIMARY KEY,
  tax_file_id        INTEGER NOT NULL REFERENCES comptaclems.taxes(id) ON DELETE CASCADE,
  original_filename  VARCHAR(500) NOT NULL,
  storage_path       TEXT NOT NULL,
  mime_type          VARCHAR(100),
  size_bytes         BIGINT,
  document_type_code VARCHAR(100),
  status             VARCHAR(50) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'validated', 'rejected')),
  rejection_reason   TEXT,
  validated_at       TIMESTAMPTZ,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alias de colonne pour compatibilité
ALTER TABLE comptaclems.tax_documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(100);

-- ─── TABLE admin_document_uploads ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.admin_document_uploads (
  id                 SERIAL PRIMARY KEY,
  client_id          INTEGER NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  admin_id           INTEGER REFERENCES comptaclems.admin(id),
  file_name          VARCHAR(500) NOT NULL,
  original_name      VARCHAR(500) NOT NULL,
  file_path          TEXT NOT NULL,
  file_size          BIGINT,
  mime_type          VARCHAR(100),
  document_authority VARCHAR(50) CHECK (document_authority IN ('REVENU_QUEBEC', 'REVENU_CANADA', 'BOTH')),
  tax_year           INTEGER,
  declaration_type   VARCHAR(100),
  notes              TEXT,
  status             VARCHAR(50) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'archived', 'deleted')),
  is_archived        BOOLEAN NOT NULL DEFAULT FALSE,
  upload_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  download_count     INTEGER NOT NULL DEFAULT 0
);

-- ─── TABLE admin_document_downloads ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.admin_document_downloads (
  id            SERIAL PRIMARY KEY,
  document_id   INTEGER NOT NULL REFERENCES comptaclems.admin_document_uploads(id) ON DELETE CASCADE,
  client_id     INTEGER REFERENCES comptaclems.clients(id),
  ip_address    INET,
  user_agent    TEXT,
  download_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TABLE testimonials (témoignages) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.testimonials (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER REFERENCES comptaclems.clients(id),
  display_name VARCHAR(200),
  job_title    VARCHAR(200),
  short_quote  TEXT,
  full_text    TEXT,
  rating       SMALLINT CHECK (rating BETWEEN 1 AND 5),
  status       VARCHAR(50) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'published', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ
);

-- Migration : si is_published existe, convertir en status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'comptaclems' AND table_name = 'testimonials' AND column_name = 'is_published'
  ) THEN
    UPDATE comptaclems.testimonials
    SET status = CASE WHEN is_published THEN 'published' ELSE 'pending' END
    WHERE status IS NULL OR status = '';

    ALTER TABLE comptaclems.testimonials DROP COLUMN IF EXISTS is_published;
  END IF;
END $$;

-- ─── TABLE formulaire (contacts) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.formulaire (
  id          SERIAL PRIMARY KEY,
  full_name   VARCHAR(300),
  email       VARCHAR(255),
  phone       VARCHAR(50),
  subject     VARCHAR(200),
  message     TEXT,
  source_page VARCHAR(200),
  status      VARCHAR(50) DEFAULT 'new',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TABLE service_interests (intérêts services) ──────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.service_interests (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER REFERENCES comptaclems.clients(id),
  email        VARCHAR(255) NOT NULL,
  client_name  VARCHAR(300),
  service      VARCHAR(100) NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   INET,
  user_agent   TEXT
);

-- ─── TABLE audit_log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.audit_log (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES comptaclems.admin(id),
  action      VARCHAR(200) NOT NULL,
  target_type VARCHAR(100),
  target_id   INTEGER,
  details     JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TABLE scheduled_jobs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comptaclems.scheduled_jobs (
  id           SERIAL PRIMARY KEY,
  type         VARCHAR(100) NOT NULL,
  payload      JSONB,
  run_at       TIMESTAMPTZ NOT NULL,
  status       VARCHAR(50) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'running', 'done', 'failed')),
  error_message TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ─── NOUVELLES TABLES ─────────────────────────────────────────────────────────

-- TABLE invoices (factures Interac)
CREATE TABLE IF NOT EXISTS comptaclems.invoices (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  tax_id              INTEGER REFERENCES comptaclems.taxes(id),
  invoice_number      VARCHAR(50) NOT NULL UNIQUE,
  amount              DECIMAL(10, 2) NOT NULL,
  status              VARCHAR(50) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'cancelled', 'overdue')),
  due_date            DATE,
  paid_at             TIMESTAMPTZ,
  payment_reference   VARCHAR(100),
  payment_note        TEXT,
  service_description TEXT,
  notes               TEXT,
  created_by          INTEGER REFERENCES comptaclems.admin(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ
);

-- TABLE messages (messagerie interne)
CREATE TABLE IF NOT EXISTS comptaclems.messages (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  admin_id    INTEGER REFERENCES comptaclems.admin(id),
  subject     VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('client', 'admin')),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_client_id ON comptaclems.messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read   ON comptaclems.messages(is_read) WHERE is_read = FALSE;

-- TABLE notifications (notifications temps réel)
CREATE TABLE IF NOT EXISTS comptaclems.notifications (
  id         SERIAL PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES comptaclems.clients(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL DEFAULT 'info',
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON comptaclems.notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read   ON comptaclems.notifications(is_read) WHERE is_read = FALSE;

-- ─── INDEX DE PERFORMANCE ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_taxes_client_id        ON comptaclems.taxes(client_id);
CREATE INDEX IF NOT EXISTS idx_taxes_fiscal_year      ON comptaclems.taxes(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_taxes_status           ON comptaclems.taxes(status);
CREATE INDEX IF NOT EXISTS idx_tax_docs_tax_file_id   ON comptaclems.tax_documents(tax_file_id);
CREATE INDEX IF NOT EXISTS idx_admin_doc_client_id    ON comptaclems.admin_document_uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id     ON comptaclems.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status        ON comptaclems.invoices(status);

-- ─── VUES UTILITAIRES ─────────────────────────────────────────────────────────

-- Vue synthèse client
CREATE OR REPLACE VIEW comptaclems.v_client_summary AS
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.canada_status,
  c.is_active,
  ca.email_verified,
  ca.last_login_at,
  COUNT(DISTINCT t.id)     AS nb_declarations,
  COUNT(DISTINCT m.id) FILTER (WHERE m.sender_type = 'client' AND m.is_read = FALSE) AS messages_non_lus,
  COUNT(DISTINCT inv.id) FILTER (WHERE inv.status = 'pending') AS factures_en_attente
FROM comptaclems.clients c
LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
LEFT JOIN comptaclems.taxes t            ON t.client_id  = c.id
LEFT JOIN comptaclems.messages m         ON m.client_id  = c.id
LEFT JOIN comptaclems.invoices inv       ON inv.client_id = c.id
GROUP BY c.id, ca.email_verified, ca.last_login_at;

-- ─── MESSAGE DE CONFIRMATION ──────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE '✅ Migration ComptaClems v2.0 appliquée avec succès !';
  RAISE NOTICE '   Nouvelles tables : invoices, messages, notifications';
  RAISE NOTICE '   Colonnes 2FA admin : totp_secret, totp_secret_temp, totp_enabled';
  RAISE NOTICE '   Témoignages : migration is_published → status appliquée';
END $$;
