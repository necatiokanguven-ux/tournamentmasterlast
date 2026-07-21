import os from "os";

let lastCpuUsage = process.cpuUsage();
let lastCpuAt = Date.now();
let eventLoopLagMs = 0;
let eventLoopTimer: ReturnType<typeof setInterval> | null = null;

export function startHostMetricsSampler(): void {
  if (eventLoopTimer) return;
  let expected = Date.now() + 1000;
  eventLoopTimer = setInterval(() => {
    const now = Date.now();
    eventLoopLagMs = Math.max(0, now - expected);
    expected = now + 1000;
  }, 1000);
  eventLoopTimer.unref();
}

export function getHostMetricsSnapshot(): {
  cpuPercent: number;
  processCpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramPercent: number;
  processRssMb: number;
  eventLoopLagMs: number;
} {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - lastCpuAt);
  const cpuDelta = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastCpuAt = now;

  const processCpuPercent = Math.round(
    ((cpuDelta.user + cpuDelta.system) / 1000 / elapsedMs) * 100,
  );

  const ramTotalMb = Math.round(os.totalmem() / (1024 * 1024));
  const ramFreeMb = Math.round(os.freemem() / (1024 * 1024));
  const ramUsedMb = ramTotalMb - ramFreeMb;
  const ramPercent = ramTotalMb > 0 ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0;
  const processRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

  const loadAvg = os.loadavg()[0] ?? 0;
  const cpuCount = Math.max(1, os.cpus().length);
  const cpuPercent = Math.min(100, Math.round((loadAvg / cpuCount) * 100));

  return {
    cpuPercent,
    processCpuPercent,
    ramUsedMb,
    ramTotalMb,
    ramPercent,
    processRssMb,
    eventLoopLagMs,
  };
}
