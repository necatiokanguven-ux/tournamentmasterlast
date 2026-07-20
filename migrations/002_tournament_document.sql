-- Phase 2 active storage: full tournament snapshot (JSON document store).
-- Normalized tables in 001_initial.sql remain for future optimization (F6+).

CREATE TABLE IF NOT EXISTS tournament_document (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL,
  last_modified BIGINT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0
);
