import type { TournamentDatabase } from "../tournamentDatabase";
import { isRedisEnabled } from "./redisConfig";
import { isRedisConnected } from "./redisClient";

const DEFAULT_TTL_MS = 1500;

type CacheEntry = {
  db: TournamentDatabase;
  expiresAt: number;
};

let entry: CacheEntry | null = null;
let redisFallbackLogged = false;

export function isSnapshotCacheEnabled(): boolean {
  return process.env.SNAPSHOT_CACHE === "true" || isRedisEnabled();
}

export function resolveSnapshotCacheTtlMs(): number {
  const raw = Number(process.env.SNAPSHOT_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw >= 250 && raw <= 5000) {
    return raw;
  }
  return DEFAULT_TTL_MS;
}

export function getCachedSnapshot(read: () => TournamentDatabase): TournamentDatabase {
  if (!isSnapshotCacheEnabled()) {
    return read();
  }

  if (isRedisEnabled() && !isRedisConnected() && !redisFallbackLogged) {
    redisFallbackLogged = true;
    console.warn("[snapshot-cache] Redis unavailable — using in-memory TTL cache (F9.6 fallback).");
  }

  const now = Date.now();
  if (entry && entry.expiresAt > now) {
    return entry.db;
  }

  const db = read();
  entry = {
    db: structuredClone(db),
    expiresAt: now + resolveSnapshotCacheTtlMs(),
  };
  return db;
}

export function invalidateSnapshotCache(): void {
  entry = null;
}

export function getSnapshotCacheStatus(): {
  enabled: boolean;
  ttlMs: number;
  active: boolean;
  redisFallback: boolean;
} {
  const enabled = isSnapshotCacheEnabled();
  return {
    enabled,
    ttlMs: resolveSnapshotCacheTtlMs(),
    active: enabled && entry !== null && entry.expiresAt > Date.now(),
    redisFallback: isRedisEnabled() && !isRedisConnected(),
  };
}
