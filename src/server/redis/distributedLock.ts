import { isRedisEnabled } from "./redisConfig";
import { isRedisConnected, probeRedisConnection, redisSetNxPx } from "./redisClient";

const LOCAL_LOCKS = new Map<string, { owner: string; until: number }>();
let redisLockFallbackLogged = false;

export type LockRelease = () => void;

export type LockResult = {
  acquired: boolean;
  release: LockRelease;
  backend: "redis" | "memory" | "none";
};

function releaseLocalLock(key: string, owner: string): void {
  const existing = LOCAL_LOCKS.get(key);
  if (existing?.owner === owner) {
    LOCAL_LOCKS.delete(key);
  }
}

async function tryRedisLock(key: string, owner: string, ttlMs: number): Promise<boolean> {
  if (!isRedisEnabled()) {
    return false;
  }

  if (!(await probeRedisConnection())) {
    if (!redisLockFallbackLogged) {
      redisLockFallbackLogged = true;
      console.warn("[distributed-lock] Redis unavailable — using in-memory locks (F9.6 fallback).");
    }
    return false;
  }

  return redisSetNxPx(`tm:lock:${key}`, owner, ttlMs);
}

function tryLocalLock(key: string, owner: string, ttlMs: number): boolean {
  const now = Date.now();
  const existing = LOCAL_LOCKS.get(key);
  if (existing && existing.until > now && existing.owner !== owner) {
    return false;
  }

  LOCAL_LOCKS.set(key, { owner, until: now + ttlMs });
  return true;
}

export async function acquireDistributedLock(
  key: string,
  options?: { ttlMs?: number; owner?: string },
): Promise<LockResult> {
  const ttlMs = options?.ttlMs ?? 5000;
  const owner = options?.owner ?? `pid:${process.pid}`;

  const noopRelease: LockRelease = () => {};

  if (await tryRedisLock(key, owner, ttlMs)) {
    return {
      acquired: true,
      backend: "redis",
      release: () => {
        void owner;
      },
    };
  }

  if (tryLocalLock(key, owner, ttlMs)) {
    return {
      acquired: true,
      backend: "memory",
      release: () => releaseLocalLock(key, owner),
    };
  }

  return { acquired: false, release: noopRelease, backend: "none" };
}

export async function acquireZoneMutationLock(zoneId: string | null): Promise<LockResult> {
  const key = zoneId ? `zone:${zoneId}` : "zone:global";
  return acquireDistributedLock(key, { ttlMs: 8000 });
}

export async function acquireTableLock(tableNumber: number): Promise<LockResult> {
  return acquireDistributedLock(`table:${tableNumber}`, { ttlMs: 5000 });
}
