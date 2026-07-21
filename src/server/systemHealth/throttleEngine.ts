import { getHttpMetricsSnapshot, type HttpMetricsSnapshot } from "./httpMetrics";
import { getHostMetricsSnapshot } from "./hostMetrics";
import {
  ESCALATE_HOLD_MS,
  RECOVER_HOLD_MS,
  evaluateSystemHealth,
  getDisplayStatus,
  type ProtectionContext,
  type SystemHealthStatus,
} from "./healthThresholds";
import {
  describeTuningChange,
  getRuntimeTuningState,
  isAutoProtectionEnabled,
  setThrottleLevel,
  type ThrottleLevel,
} from "./runtimeTuning";
import { appendTuningAudit, seedBaselineAudit } from "./tuningAuditLog";

export type { SystemHealthStatus } from "./healthThresholds";

const TICK_MS = 5_000;

let stressStartedAt: number | null = null;
let calmStartedAt: number | null = null;
let lastDisplayStatus: SystemHealthStatus = "green";
let lastEvaluation: ReturnType<typeof evaluateSystemHealth> | null = null;
let baselineSeeded = false;

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

function formatReason(
  host: ReturnType<typeof getHostMetricsSnapshot>,
  http: HttpMetricsSnapshot,
  evaluation: ReturnType<typeof evaluateSystemHealth>,
  heldSec: number,
): string {
  const p95Label = http.p95Reliable ? `${http.overallP95Ms}ms` : "n/a (low traffic)";
  const triggerHint = evaluation.triggers.length > 0 ? ` — ${evaluation.triggers.join(", ")}` : "";
  return `Load held ${heldSec}s — CPU ${host.cpuPercent}%, p95 ${p95Label}, ${http.totalReqPerSec} req/s${triggerHint}`;
}

export function getSystemHealthStatus(): SystemHealthStatus {
  return lastDisplayStatus;
}

export function getLastHealthEvaluation() {
  return lastEvaluation;
}

export function tickAutoProtection(
  host: ReturnType<typeof getHostMetricsSnapshot>,
  http: HttpMetricsSnapshot,
  context: ProtectionContext,
): { status: SystemHealthStatus; levelChanged: boolean } {
  const evaluation = evaluateSystemHealth(host, http, context);
  lastEvaluation = evaluation;

  const tuning = getRuntimeTuningState();
  let levelChanged = false;

  if (!isAutoProtectionEnabled() || evaluation.inGracePeriod) {
    if (tuning.level > 0) {
      setThrottleLevel(0);
      levelChanged = true;
    }
    stressStartedAt = null;
    calmStartedAt = null;
    lastDisplayStatus = "green";
    return { status: lastDisplayStatus, levelChanged };
  }

  const now = Date.now();
  const stressStatus = evaluation.enterStatus;
  const calmEnough = evaluation.exitStatus === "green";

  if (stressStatus !== "green") {
    calmStartedAt = null;
    if (stressStartedAt === null) {
      stressStartedAt = now;
    }

    const heldMs = now - stressStartedAt;
    if (heldMs >= ESCALATE_HOLD_MS) {
      const targetLevel = targetLevelForStatus(stressStatus);
      if (targetLevel > tuning.level) {
        const fromLevel = tuning.level;
        setThrottleLevel(targetLevel);
        appendTuningAudit({
          action: describeTuningChange(fromLevel, targetLevel),
          reason: formatReason(host, http, evaluation, Math.round(heldMs / 1000)),
          expectedEffect: "Lower device refresh rate — system breathing room",
        });
        levelChanged = true;
      }
    }
  } else if (calmEnough) {
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
        reason: `Stable calm for ${Math.round(heldMs / 1000)}s — CPU ${host.cpuPercent}%, ${http.totalReqPerSec} req/s`,
        expectedEffect: "Full return to normal device refresh speed",
      });
      levelChanged = true;
      calmStartedAt = null;
    }
  } else {
    stressStartedAt = null;
    calmStartedAt = null;
  }

  const currentLevel = getRuntimeTuningState().level;
  lastDisplayStatus = getDisplayStatus(stressStatus, currentLevel);

  return { status: lastDisplayStatus, levelChanged };
}

let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickContext: ProtectionContext = { uptimeMs: 0, connectedDevices: 0 };

export function setAutoProtectionContext(context: ProtectionContext): void {
  tickContext = context;
}

export function startAutoProtectionEngine(): void {
  if (tickTimer) return;
  if (!baselineSeeded) {
    baselineSeeded = true;
    seedBaselineAudit();
  }
  tickTimer = setInterval(() => {
    tickAutoProtection(getHostMetricsSnapshot(), getHttpMetricsSnapshot(), {
      uptimeMs: Math.round(process.uptime() * 1000),
      connectedDevices: tickContext.connectedDevices,
    });
  }, TICK_MS);
  tickTimer.unref();
}

export function getNavStatusLabel(
  status: SystemHealthStatus,
  level: ThrottleLevel,
  evaluation?: ReturnType<typeof evaluateSystemHealth> | null,
): {
  primary: string;
  secondary?: string;
  tone: "green" | "yellow" | "orange" | "red";
} {
  if (evaluation?.inGracePeriod) {
    const mins = Math.ceil((evaluation.graceRemainingMs ?? 0) / 60_000);
    return {
      primary: "System normal",
      secondary: mins > 0 ? `Startup calibration — ${mins}m remaining` : "Startup calibration",
      tone: "green",
    };
  }

  switch (status) {
    case "green":
      return {
        primary: "System normal",
        secondary: level > 0 ? `Refreshing speeds recovering (level ${level})` : undefined,
        tone: "green",
      };
    case "yellow":
      return {
        primary: "Elevated load",
        secondary: level > 0 ? `Auto Protection level ${level}` : "Monitoring — tournament can continue",
        tone: "yellow",
      };
    case "orange":
      return {
        primary: "High load",
        secondary: level > 0 ? `Auto Protection level ${level} active` : "Consider pausing new devices",
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
