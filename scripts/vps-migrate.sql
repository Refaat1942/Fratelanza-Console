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
