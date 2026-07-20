-- Phase 5G.12 — dealer phone grace columns (shadow sync from tournament_document)
-- Phase 6 — zone_id column for reporting
-- Writes still go through tournament_document; these columns support queries & restart drills.

ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS phone_session_token TEXT;
ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS phone_device_id TEXT;
ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS phone_last_seen_at TIMESTAMPTZ;
ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS phone_grace_until TIMESTAMPTZ;
ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS state_before_disconnect TEXT;
ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS zone_id TEXT;
ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS rotation_state TEXT;
ALTER TABLE dealer_staff ADD COLUMN IF NOT EXISTS table_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_dealer_staff_phone_grace_until
  ON dealer_staff (phone_grace_until)
  WHERE phone_grace_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dealer_staff_zone_id
  ON dealer_staff (zone_id)
  WHERE zone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_document_dealer_staff
  ON tournament_document USING GIN ((payload -> 'dealerRotation' -> 'staff'));

COMMENT ON COLUMN dealer_staff.phone_grace_until IS 'Phase 5G — synced from JSON staff payload on each PG save';
COMMENT ON COLUMN dealer_staff.zone_id IS 'Phase 6 — dealer zone assignment when DEALER_ZONES=true';
