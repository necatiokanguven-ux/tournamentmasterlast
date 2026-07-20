/** QR Live Tracking poll intervals — read-only, delay-tolerant client refresh. */
export const TRACKING_LIVE_POLL_MS = 10_000;
export const TRACKING_PLAYERS_POLL_MS = 10_000;

/** Server-side JSON cache TTL for tracking read endpoints (slightly under client poll). */
export const TRACKING_RESPONSE_CACHE_MS = 8_000;
