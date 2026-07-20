/** Phase 9 — optional Redis (default off). */

export function isRedisEnabled(): boolean {
  return process.env.USE_REDIS === "true";
}

export function resolveRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url || null;
}
