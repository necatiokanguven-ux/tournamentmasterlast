import { getHttpMetricsSnapshot, type HttpMetricsSnapshot } from "./httpMetrics";
import { getHostMetricsSnapshot } from "./hostMetrics";
import {
  describeTuningChange,
  getRuntimeTuningState,
  isAutoProtectionEnabled,
  setThrottleLevel,
  type ThrottleLevel,
} from "./runtimeTuning";
import { appendTuningAudit, seedBaselineAudit } from "./tuningAuditLog";

export type SystemHealthStatus = "green" | "yellow" | "orange" | "red";

const ESCALATE_HOLD_MS = 30_000;
const RECOVER_HOLD_MS = 120_000;
const TICK_MS = 5_000;

let stressStartedAt: number | null = null;
let calmStartedAt: number | null = null;
let lastStatus: SystemHealthStatus = "green";
let baselineSeeded = false;

function evaluateRawStatus(
  host: ReturnType<typeof getHostMetricsSnapshot>,
  http: HttpMetricsSnapshot,
): SystemHealthStatus {
  // RAM is shown in the UI for operator awareness only — Windows manages memory
  // cache aggressively on 8 GB venue PCs; OS RAM % caused false orange/red alarms.
  if (
    host.cpuPercent >= 90
    || host.eventLoopLagMs >= 400
    || http.errorRatePercent >= 5
    || http.overallP95Ms >= 3_000
  ) {
    return "red";
  }

  if (
    host.cpuPercent >= 80
    || host.eventLoopLagMs >= 200
    || http.overallP95Ms >= 2_000
    || http.totalReqPerSec >= 35
  ) {
    return "orange";
  }

  if (
    host.cpuPercent >= 70
    || host.eventLoopLagMs >= 120
    || http.overallP95Ms >= 1_000
    || http.totalReqPerSec >= 22
  ) {
    return "yellow";
  }

  return "green";
}

function targetLevelForStatus(status: SystemHealthStatus): ThrottleLevel {
  switch (status) {
    case "red":
      return 3;
    case "orange":
      return 2;
    case "yellow":
      return 1;
    default:
      return 0;
  }
}

export function getSystemHealthStatus(): SystemHealthStatus {
  return lastStatus;
}

export function tickAutoProtection(
  host: ReturnType<typeof getHostMetricsSnapshot>,
  http: HttpMetricsSnapshot,
): { status: SystemHealthStatus; levelChanged: boolean } {
  if (!isAutoProtectionEnabled()) {
    lastStatus = evaluateRawStatus(host, http);
    return { status: lastStatus, levelChanged: false };
  }

  const rawStatus = evaluateRawStatus(host, http);
  const now = Date.now();
  const tuning = getRuntimeTuningState();
  let levelChanged = false;

  if (rawStatus !== "green") {
    calmStartedAt = null;
    if (stressStartedAt === null) {
      stressStartedAt = now;
    }

    const heldMs = now - stressStartedAt;
    if (heldMs >= ESCALATE_HOLD_MS) {
      const targetLevel = targetLevelForStatus(rawStatus);
      if (targetLevel > tuning.level) {
        const fromLevel = tuning.level;
        setThrottleLevel(targetLevel);
        appendTuningAudit({
          action: describeTuningChange(fromLevel, targetLevel),
          reason: `Load held ${Math.round(heldMs / 1000)}s — CPU ${host.cpuPercent}%, p95 ${http.overallP95Ms}ms, ${http.totalReqPerSec} req/s`,
          expectedEffect: "Lower device refresh rate — system breathing room",
        });
        levelChanged = true;
      }
    }
  } else {
    stressStartedAt = null;
    if (calmStartedAt === null) {
      calmStartedAt = now;
    }

    const heldMs = now - calmStartedAt;
    if (heldMs >= RECOVER_HOLD_MS && tuning.level > 0) {
      const fromLevel = tuning.level;
      setThrottleLevel(0);
      appendTuningAudit({
        action: describeTuningChange(fromLevel, 0),
        reason: `Stable green for ${Math.round(heldMs / 1000)}s — CPU ${host.cpuPercent}%, p95 ${http.overallP95Ms}ms`,
        expectedEffect: "Full return to normal device refresh speed",
      });
      levelChanged = true;
      calmStartedAt = null;
    }
  }

  // Status reflects load metrics only — never inflate because Auto Protection level > 0.
  lastStatus = rawStatus;

  return { status: lastStatus, levelChanged };
}

let tickTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoProtectionEngine(): void {
  if (tickTimer) return;
  if (!baselineSeeded) {
    baselineSeeded = true;
    seedBaselineAudit();
  }
  tickTimer = setInterval(() => {
    tickAutoProtection(getHostMetricsSnapshot(), getHttpMetricsSnapshot());
  }, TICK_MS);
  tickTimer.unref();
}

export function getNavStatusLabel(
  status: SystemHealthStatus,
  _autoProtectionActive: boolean,
  level: ThrottleLevel,
): {
  primary: string;
  secondary?: string;
  tone: "green" | "yellow" | "orange" | "red";
} {
  switch (status) {
    case "green":
      return {
        primary: "System normal",
        secondary: level > 0 ? `Auto Protection recovering (level ${level})` : undefined,
        tone: "green",
      };
    case "yellow":
      return { primary: "Load rising", secondary: "Watching traffic", tone: "yellow" };
    case "orange":
      return {
        primary: "High load",
        secondary: level > 0 ? `Auto Protection level ${level} active` : "Reduce new devices",
        tone: "orange",
      };
    case "red":
      return {
        primary: "Critical load",
        secondary: level > 0 ? `Auto Protection level ${level} active` : "Do not add devices",
        tone: "red",
      };
    default:
      return { primary: "System normal", tone: "green" };
  }
}
