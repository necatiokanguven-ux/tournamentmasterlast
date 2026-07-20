-- Phase 6 — dealer zones (stored in tournament_settings / dealer_staff JSON payloads)
-- No separate tables required while tournament document model is used.

COMMENT ON TABLE tournament_settings IS 'Includes optional dealerZones[] when DEALER_ZONES=true';
COMMENT ON TABLE dealer_staff IS 'Staff payload includes optional zoneId when DEALER_ZONES=true';
