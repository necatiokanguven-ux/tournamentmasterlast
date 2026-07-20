import { isRedisEnabled } from "./redisConfig";
import { isRedisConnected, probeRedisConnection } from "./redisClient";

type MetricsSnapshot = {
  enabled: boolean;
  requestCount: number;
  lastRequestMs: number | null;
  startedAt: number;
};

const snapshot: MetricsSnapshot = {
  enabled: isRedisEnabled(),
  requestCount: 0,
  lastRequestMs: null,
  startedAt: Date.now(),
};

export function recordRequestDuration(ms: number): void {
  snapshot.requestCount += 1;
  snapshot.lastRequestMs = ms;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return { ...snapshot };
}

export async function getRedisStatus(): Promise<{ enabled: boolean; connected: boolean }> {
  if (!isRedisEnabled()) {
    return { enabled: false, connected: false };
  }

  const connected = await probeRedisConnection();
  return { enabled: true, connected };
}

export function getRedisStatusSync(): { enabled: boolean; connected: boolean } {
  return { enabled: isRedisEnabled(), connected: isRedisConnected() };
}
