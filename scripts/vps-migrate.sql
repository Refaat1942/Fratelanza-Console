-- Fratelanza Console schema updates (safe to re-run)
-- Run: docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console < scripts/vps-migrate.sql

CREATE TABLE IF NOT EXISTS project_payments (
  id serial PRIMARY KEY,
  project_id integer NOT NULL,
  amount numeric(12, 2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  paid_at text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_records ADD COLUMN IF NOT EXISTS technical_outline text;
ALTER TABLE pricing_records ADD COLUMN IF NOT EXISTS outline_file_name text;
ALTER TABLE pricing_records ADD COLUMN IF NOT EXISTS outline_file_data text;
ALTER TABLE pricing_records ADD COLUMN IF NOT EXISTS quote_id integer;
ALTER TABLE pricing_records ADD COLUMN IF NOT EXISTS generated_report text;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Users table (auth) — safe upgrades for older DBs
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin';
ALTER TABLE users ADD COLUMN IF NOT EXISTS page_permissions text[] NOT NULL DEFAULT '{}';

-- Freelancers table (full schema; upgrades legacy Python-era tables)
CREATE TABLE IF NOT EXISTS freelancers (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  spec text,
  position text,
  earned numeric(12, 2) NOT NULL DEFAULT 0,
  balance numeric(12, 2) NOT NULL DEFAULT 0,
  rating numeric(3, 1) NOT NULL DEFAULT 5,
  bio text,
  portfolio_url text,
  cv_file_name text,
  cv_data text,
  skills text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'freelancers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'freelancers' AND column_name = 'id'
  ) THEN
    ALTER TABLE freelancers ADD COLUMN id serial;
  END IF;
END $$;

ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS rating numeric(3, 1) NOT NULL DEFAULT 5;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS portfolio_url text;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS cv_file_name text;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS cv_data text;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS skills text;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS freelancers_code_key ON freelancers (code);
