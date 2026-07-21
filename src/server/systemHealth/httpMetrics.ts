type LatencyBucket = {
  count: number;
  totalMs: number;
  latencies: number[];
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
/** Ignore latency-based protection until enough real samples exist. */
export const MIN_SAMPLES_FOR_P95 = 30;
const MAX_SAMPLES_PER_BUCKET = 180;

const buckets: Record<TrafficChannel, LatencyBucket> = {
  dealerTablet: { count: 0, totalMs: 0, latencies: [] },
  dealerPhone: { count: 0, totalMs: 0, latencies: [] },
  dealerControl: { count: 0, totalMs: 0, latencies: [] },
  tracking: { count: 0, totalMs: 0, latencies: [] },
  floor: { count: 0, totalMs: 0, latencies: [] },
  display: { count: 0, totalMs: 0, latencies: [] },
  other: { count: 0, totalMs: 0, latencies: [] },
};

let recentRequests = 0;
let recentErrors = 0;
let windowStartedAt = Date.now();

function resetBucket(bucket: LatencyBucket) {
  bucket.count = 0;
  bucket.totalMs = 0;
  bucket.latencies = [];
}

function maybeRollWindow(now: number) {
  if (now - windowStartedAt < WINDOW_MS) return;
  windowStartedAt = now;
  recentRequests = 0;
  recentErrors = 0;
  for (const bucket of Object.values(buckets)) {
    resetBucket(bucket);
  }
}

function pushLatency(bucket: LatencyBucket, durationMs: number) {
  bucket.latencies.push(durationMs);
  if (bucket.latencies.length > MAX_SAMPLES_PER_BUCKET) {
    bucket.latencies.shift();
  }
}

function computeP95(latencies: number[]): number {
  if (latencies.length < MIN_SAMPLES_FOR_P95) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return Math.round(sorted[index] ?? 0);
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
  bucket.count += 1;
  bucket.totalMs += durationMs;
  pushLatency(bucket, durationMs);
}

export type ChannelMetricsSnapshot = {
  channel: TrafficChannel;
  reqPerSec: number;
  avgMs: number;
  p95Ms: number;
  count: number;
  p95Reliable: boolean;
};

export type HttpMetricsSnapshot = {
  totalReqPerSec: number;
  totalRequestCount: number;
  errorRatePercent: number;
  channels: ChannelMetricsSnapshot[];
  overallP95Ms: number;
  p95Reliable: boolean;
};

export function getHttpMetricsSnapshot(): HttpMetricsSnapshot {
  const now = Date.now();
  maybeRollWindow(now);
  const windowSec = Math.max(1, (now - windowStartedAt) / 1000);

  const channels = (Object.keys(buckets) as TrafficChannel[]).map((channel) => {
    const bucket = buckets[channel];
    const avgMs = bucket.count > 0 ? bucket.totalMs / bucket.count : 0;
    const p95Reliable = bucket.latencies.length >= MIN_SAMPLES_FOR_P95;
    const p95Ms = computeP95(bucket.latencies);
    return {
      channel,
      reqPerSec: Math.round((bucket.count / windowSec) * 10) / 10,
      avgMs: Math.round(avgMs),
      p95Ms,
      count: bucket.count,
      p95Reliable,
    };
  });

  const allLatencies = channels.flatMap((row) => buckets[row.channel].latencies);
  const p95Reliable = allLatencies.length >= MIN_SAMPLES_FOR_P95;
  const overallP95Ms = computeP95(allLatencies);

  return {
    totalReqPerSec: Math.round((recentRequests / windowSec) * 10) / 10,
    totalRequestCount: recentRequests,
    errorRatePercent: recentRequests > 0 ? Math.round((recentErrors / recentRequests) * 1000) / 10 : 0,
    channels,
    overallP95Ms,
    p95Reliable,
  };
}
