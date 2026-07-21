type LatencyBucket = {
  count: number;
  totalMs: number;
  maxMs: number;
  windowStartedAt: number;
};

export type TrafficChannel =
  | "dealerTablet"
  | "dealerPhone"
  | "dealerControl"
  | "tracking"
  | "floor"
  | "display"
  | "other";

const WINDOW_MS = 60_000;

const buckets: Record<TrafficChannel, LatencyBucket> = {
  dealerTablet: { count: 0, totalMs: 0, maxMs: 0, windowStartedAt: Date.now() },
  dealerPhone: { count: 0, totalMs: 0, maxMs: 0, windowStartedAt: Date.now() },
  dealerControl: { count: 0, totalMs: 0, maxMs: 0, windowStartedAt: Date.now() },
  tracking: { count: 0, totalMs: 0, maxMs: 0, windowStartedAt: Date.now() },
  floor: { count: 0, totalMs: 0, maxMs: 0, windowStartedAt: Date.now() },
  display: { count: 0, totalMs: 0, maxMs: 0, windowStartedAt: Date.now() },
  other: { count: 0, totalMs: 0, maxMs: 0, windowStartedAt: Date.now() },
};

let recentRequests = 0;
let recentErrors = 0;
let windowStartedAt = Date.now();

function resetBucket(bucket: LatencyBucket, now: number) {
  bucket.count = 0;
  bucket.totalMs = 0;
  bucket.maxMs = 0;
  bucket.windowStartedAt = now;
}

function maybeRollWindow(now: number) {
  if (now - windowStartedAt < WINDOW_MS) return;
  windowStartedAt = now;
  recentRequests = 0;
  recentErrors = 0;
  for (const bucket of Object.values(buckets)) {
    resetBucket(bucket, now);
  }
}

export function classifyRequestPath(path: string, userAgent: string | undefined): TrafficChannel {
  if (path.startsWith("/api/dealer/table/")) return "dealerTablet";
  if (path.startsWith("/api/dealer-control")) {
    const ua = (userAgent ?? "").toLowerCase();
    if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
      return "dealerPhone";
    }
    return "dealerControl";
  }
  if (path.startsWith("/api/tracking") || path.startsWith("/track")) return "tracking";
  if (path.startsWith("/api/floor") || path.startsWith("/floor")) return "floor";
  if (path.startsWith("/display") || path.includes("/api/data")) return "display";
  return "other";
}

export function recordHttpRequest(channel: TrafficChannel, durationMs: number, isError: boolean): void {
  const now = Date.now();
  maybeRollWindow(now);
  recentRequests += 1;
  if (isError) recentErrors += 1;

  const bucket = buckets[channel];
  if (now - bucket.windowStartedAt >= WINDOW_MS) {
    resetBucket(bucket, now);
  }
  bucket.count += 1;
  bucket.totalMs += durationMs;
  bucket.maxMs = Math.max(bucket.maxMs, durationMs);
}

function percentile(maxMs: number, avgMs: number): number {
  return Math.round(maxMs * 0.85 + avgMs * 0.15);
}

export type ChannelMetricsSnapshot = {
  channel: TrafficChannel;
  reqPerSec: number;
  avgMs: number;
  p95Ms: number;
  count: number;
};

export type HttpMetricsSnapshot = {
  totalReqPerSec: number;
  errorRatePercent: number;
  channels: ChannelMetricsSnapshot[];
  overallP95Ms: number;
};

export function getHttpMetricsSnapshot(): HttpMetricsSnapshot {
  const now = Date.now();
  maybeRollWindow(now);
  const windowSec = Math.max(1, (now - windowStartedAt) / 1000);

  const channels = (Object.keys(buckets) as TrafficChannel[]).map((channel) => {
    const bucket = buckets[channel];
    const avgMs = bucket.count > 0 ? bucket.totalMs / bucket.count : 0;
    return {
      channel,
      reqPerSec: Math.round((bucket.count / windowSec) * 10) / 10,
      avgMs: Math.round(avgMs),
      p95Ms: percentile(bucket.maxMs, avgMs),
      count: bucket.count,
    };
  });

  const overallP95Ms = channels.reduce((max, row) => Math.max(max, row.p95Ms), 0);

  return {
    totalReqPerSec: Math.round((recentRequests / windowSec) * 10) / 10,
    errorRatePercent: recentRequests > 0 ? Math.round((recentErrors / recentRequests) * 1000) / 10 : 0,
    channels,
    overallP95Ms,
  };
}
