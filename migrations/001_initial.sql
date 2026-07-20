-- Tournament Master — initial PostgreSQL schema (Phase 2.1 draft)
-- Not applied until PostgresRepository is implemented.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_meta (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_modified BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tournament_settings (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_clock (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS table_seats (
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  seat_index SMALLINT NOT NULL CHECK (seat_index >= 0 AND seat_index <= 8),
  player_id TEXT,
  PRIMARY KEY (table_id, seat_index)
);

CREATE TABLE IF NOT EXISTS history_events (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS floor_calls (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS dealer_rotation_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS dealer_staff (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dealer_pool_queue (
  position INTEGER PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealer_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dealer_notifications (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS dealer_work_log (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_version ON players(version);
CREATE INDEX IF NOT EXISTS idx_tables_number ON tables(number);
CREATE INDEX IF NOT EXISTS idx_history_occurred ON history_events(occurred_at);
