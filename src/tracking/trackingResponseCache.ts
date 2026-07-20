import { TRACKING_RESPONSE_CACHE_MS } from "./trackingPollConfig";

type CacheEntry<T> = {
  payload: T;
  metaVersion: number;
  expiresAt: number;
};

let playersCache: CacheEntry<unknown> | null = null;

function readMetaVersion(meta: { lastModified?: number } | undefined): number {
  return meta?.lastModified ?? 0;
}

/** Server-side cache for /players only — /live always builds fresh for clock anchors. */
export function getCachedTrackingPlayersPayload<T>(
  meta: { lastModified?: number } | undefined,
  build: () => T,
): T {
  const metaVersion = readMetaVersion(meta);
  const now = Date.now();

  if (playersCache && playersCache.metaVersion === metaVersion && playersCache.expiresAt > now) {
    return playersCache.payload as T;
  }

  const payload = build();
  playersCache = {
    payload,
    metaVersion,
    expiresAt: now + TRACKING_RESPONSE_CACHE_MS,
  };

  return payload;
}

export function invalidateTrackingResponseCache(): void {
  playersCache = null;
}
