/**
 * PokerClup ID Scan API — salon app calls this; Gemini key stays on VPS only.
 */
import { POKERCLUP_ID_SCAN_API } from "../../license/pokerclupApi";

export const ID_SCAN_API_BASE =
  process.env.ID_SCAN_API_URL?.trim() || POKERCLUP_ID_SCAN_API;

export const ID_SCAN_REQUEST_TIMEOUT_MS = 45_000;
