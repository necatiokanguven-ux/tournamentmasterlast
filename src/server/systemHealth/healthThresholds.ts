import type { HttpMetricsSnapshot } from "./httpMetrics";
import type { getHostMetricsSnapshot } from "./hostMetrics";

export type SystemHealthStatus = "green" | "yellow" | "orange" | "red";

export type HostSnapshot = ReturnType<typeof getHostMetricsSnapshot>;

/** No auto protection or operator alarms during startup calibration. */
export const STARTUP_GRACE_MS = 10 * 60 * 1000;

/** Sustained high load before raising protection level. */
export const ESCALATE_HOLD_MS = 90_000;

/** Sustained calm before full recovery to level 0. */
export const RECOVER_HOLD_MS = 90_000;

export type ProtectionContext = {
  uptimeMs: number;
  connectedDevices: number;
};

export type HealthEvaluation = {
  /** Operator-facing severity (enter thresholds). */
  enterStatus: SystemHealthStatus;
  /** Used for recovery — must stay below these to de-escalate. */
  exitStatus: SystemHealthStatus;
  inGracePeriod: boolean;
  graceRemainingMs: number;
  hasVenueLoad: boolean;
  p95Reliable: boolean;
  triggers: string[];
};

function maxStatus(a: SystemHealthStatus, b: SystemHealthStatus): SystemHealthStatus {
  const order: SystemHealthStatus[] = ["green", "yellow", "orange", "red"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function hasMeaningfulVenueLoad(http: HttpMetricsSnapshot, devices: number): boolean {
  return devices >= 8 || http.totalReqPerSec >= 5;
}

function evaluateEnter(host: HostSnapshot, http: HttpMetricsSnapshot, devices: number): SystemHealthStatus {
  let status: SystemHealthStatus = "green";
  const venueLoad = hasMeaningfulVenueLoad(http, devices);
  const p95 = http.p95Reliable ? http.overallP95Ms : 0;

  if (host.cpuPercent >= 97 || http.totalReqPerSec >= 48 || host.eventLoopLagMs >= 600 || http.errorRatePercent >= 10) {
    return "red";
  }
  if (venueLoad && p95 >= 10_000) {
    return "red";
  }

  if (host.cpuPercent >= 92 || http.totalReqPerSec >= 38 || host.eventLoopLagMs >= 450 || http.errorRatePercent >= 6) {
    status = maxStatus(status, "orange");
  }
  if (venueLoad && p95 >= 6_000) {
    status = maxStatus(status, "orange");
  }

  if (venueLoad) {
    if (host.cpuPercent >= 88 || http.totalReqPerSec >= 28 || host.eventLoopLagMs >= 320) {
      status = maxStatus(status, "yellow");
    }
    if (p95 >= 4_000) {
      status = maxStatus(status, "yellow");
    }
  }

  return status;
}

function evaluateExit(host: HostSnapshot, http: HttpMetricsSnapshot): SystemHealthStatus {
  let status: SystemHealthStatus = "green";
  const p95 = http.p95Reliable ? http.overallP95Ms : 0;

  if (host.cpuPercent >= 94 || http.totalReqPerSec >= 42 || host.eventLoopLagMs >= 520 || http.errorRatePercent >= 8) {
    return "red";
  }
  if (p95 >= 8_000 && http.totalReqPerSec >= 5) {
    return "red";
  }

  if (host.cpuPercent >= 88 || http.totalReqPerSec >= 32 || host.eventLoopLagMs >= 380 || http.errorRatePercent >= 4) {
    status = maxStatus(status, "orange");
  }
  if (p95 >= 5_000 && http.totalReqPerSec >= 5) {
    status = maxStatus(status, "orange");
  }

  if (host.cpuPercent >= 82 || http.totalReqPerSec >= 22 || host.eventLoopLagMs >= 280) {
    status = maxStatus(status, "yellow");
  }
  if (p95 >= 3_500 && http.totalReqPerSec >= 5) {
    status = maxStatus(status, "yellow");
  }

  return status;
}

function collectTriggers(
  host: HostSnapshot,
  http: HttpMetricsSnapshot,
  devices: number,
  enterStatus: SystemHealthStatus,
): string[] {
  if (enterStatus === "green") return [];
  const parts: string[] = [];
  if (host.cpuPercent >= 88) parts.push(`CPU ${host.cpuPercent}%`);
  if (http.totalReqPerSec >= 22) parts.push(`${http.totalReqPerSec} req/s`);
  if (http.p95Reliable && http.overallP95Ms >= 3_500) parts.push(`p95 ${http.overallP95Ms}ms`);
  if (host.eventLoopLagMs >= 280) parts.push(`event loop ${host.eventLoopLagMs}ms`);
  if (http.errorRatePercent >= 4) parts.push(`errors ${http.errorRatePercent}%`);
  if (devices >= 8) parts.push(`${devices} devices`);
  return parts;
}

export function evaluateSystemHealth(
  host: HostSnapshot,
  http: HttpMetricsSnapshot,
  context: ProtectionContext,
): HealthEvaluation {
  const graceRemainingMs = Math.max(0, STARTUP_GRACE_MS - context.uptimeMs);
  const inGracePeriod = graceRemainingMs > 0;
  const hasVenueLoad = hasMeaningfulVenueLoad(http, context.connectedDevices);

  if (inGracePeriod) {
    return {
      enterStatus: "green",
      exitStatus: "green",
      inGracePeriod: true,
      graceRemainingMs,
      hasVenueLoad,
      p95Reliable: http.p95Reliable,
      triggers: [],
    };
  }

  const enterStatus = evaluateEnter(host, http, context.connectedDevices);
  const exitStatus = evaluateExit(host, http);

  return {
    enterStatus,
    exitStatus,
    inGracePeriod: false,
    graceRemainingMs: 0,
    hasVenueLoad,
    p95Reliable: http.p95Reliable,
    triggers: collectTriggers(host, http, context.connectedDevices, enterStatus),
  };
}

/** Operator UI follows live stress; protection level may lag during recovery. */
export function getDisplayStatus(
  enterStatus: SystemHealthStatus,
  _protectionLevel: number,
): SystemHealthStatus {
  if (enterStatus !== "green") return enterStatus;
  return "green";
}
