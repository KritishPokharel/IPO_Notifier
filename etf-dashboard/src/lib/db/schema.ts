/** Idempotent schema. Every statement must be safe to run repeatedly. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS etfs (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  focus TEXT NOT NULL,
  expense_ratio DOUBLE PRECISION NOT NULL,
  expense_ratio_status TEXT NOT NULL DEFAULT 'reference',
  expense_ratio_source TEXT,
  expense_ratio_verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_ratio_history (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES etfs(ticker),
  expense_ratio DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  note TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_prices (
  ticker TEXT NOT NULL REFERENCES etfs(ticker),
  session_date DATE NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION,
  adj_open DOUBLE PRECISION,
  adj_high DOUBLE PRECISION,
  adj_low DOUBLE PRECISION,
  adj_close DOUBLE PRECISION,
  div_cash DOUBLE PRECISION NOT NULL DEFAULT 0,
  split_factor DOUBLE PRECISION NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'single_source',
  verification_source TEXT,
  verification_close DOUBLE PRECISION,
  verification_diff_pct DOUBLE PRECISION,
  verification_checked_at TIMESTAMPTZ,
  verification_note TEXT,
  PRIMARY KEY (ticker, session_date)
);

CREATE TABLE IF NOT EXISTS job_runs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  slot TEXT,
  session_date DATE,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  details JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS job_runs_slot_idx ON job_runs (session_date, slot, status);

CREATE TABLE IF NOT EXISTS price_observations (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES etfs(ticker),
  session_date DATE NOT NULL,
  slot TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('intraday', 'close')),
  price DOUBLE PRECISION,
  price_field TEXT,
  prev_close DOUBLE PRECISION,
  prev_close_date DATE,
  source TEXT NOT NULL,
  quote_timestamp TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL,
  is_delayed BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL,
  secondary_source TEXT,
  secondary_price DOUBLE PRECISION,
  discrepancy_pct DOUBLE PRECISION,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  job_run_id BIGINT REFERENCES job_runs(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS price_observations_dedupe
  ON price_observations (ticker, kind, source, session_date, quote_timestamp);
CREATE INDEX IF NOT EXISTS price_observations_lookup ON price_observations (ticker, session_date);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id BIGSERIAL PRIMARY KEY,
  session_date DATE NOT NULL,
  slot TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_run_id BIGINT REFERENCES job_runs(id),
  data JSONB NOT NULL,
  UNIQUE (session_date, slot)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS target_price_alerts (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES etfs(ticker),
  direction TEXT NOT NULL CHECK (direction IN ('below', 'above')),
  target_price DOUBLE PRECISION NOT NULL CHECK (target_price > 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('alert', 'test')),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES etfs(ticker),
  session_date DATE NOT NULL,
  alert_type TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  slot TEXT NOT NULL,
  threshold DOUBLE PRECISION NOT NULL,
  prev_close DOUBLE PRECISION,
  price DOUBLE PRECISION NOT NULL,
  change_abs DOUBLE PRECISION,
  change_pct DOUBLE PRECISION,
  high_52w DOUBLE PRECISION,
  pct_below_high DOUBLE PRECISION,
  observation_ts TIMESTAMPTZ,
  verification_status TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_delivery_id BIGINT REFERENCES email_deliveries(id),
  job_run_id BIGINT REFERENCES job_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker, session_date, alert_type)
);
`;
