export type DealerTimerMode = "idle" | "call_time" | "player_time";
export type DealerTimerRunState = "stopped" | "running" | "paused";

export type DealerTimerState = {
  mode: DealerTimerMode;
  state: DealerTimerRunState;
  endTimeMs: number | null;
  startedAtMs: number | null;
  pausedRemainingSeconds: number;
  totalSeconds: number;
  revision: number;
  updatedAt: string;
};

export type DealerDeviceSession = {
  deviceId: string;
  lastSeenMs: number;
  registeredAt: string;
  deviceType: "tablet" | "phone";
};

export type DealerTimerSnapshot = DealerTimerState & {
  secondsRemaining: number;
};

export type DealerTimerAction =
  | "start_call"
  | "start_player"
  | "pause"
  | "resume"
  | "reset";

export const MAX_DEALER_DEVICES_PER_TABLE = 2;
export const DEALER_DEVICE_STALE_MS = 45_000;

export function createDefaultDealerTimerState(): DealerTimerState {
  return {
    mode: "idle",
    state: "stopped",
    endTimeMs: null,
    startedAtMs: null,
    pausedRemainingSeconds: 0,
    totalSeconds: 0,
    revision: 0,
    updatedAt: new Date().toISOString(),
  };
}

const MS_EPOCH_MIN = 1_000_000_000_000;

function normalizeEpochMs(value: number): number {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  return value < MS_EPOCH_MIN ? value * 1000 : value;
}

function isPlausibleAbsoluteMs(value: number): boolean {
  return Number.isFinite(value) && value >= MS_EPOCH_MIN;
}

export function getDealerTimerStartedAtMs(timer: DealerTimerState): number | null {
  if (timer.startedAtMs !== null) {
    return normalizeEpochMs(timer.startedAtMs);
  }

  if (timer.endTimeMs !== null && timer.totalSeconds > 0) {
    const endMs = normalizeEpochMs(timer.endTimeMs);
    if (!Number.isFinite(endMs)) {
      return null;
    }
    return endMs - timer.totalSeconds * 1000;
  }

  return null;
}

export function computeDealerTimerRemaining(
  timer: DealerTimerState,
  now = Date.now(),
): number {
  if (timer.state === "running") {
    const endTimeMs = resolveRunningEndTimeMs(
      { ...timer, secondsRemaining: 0 },
      now,
    );
    if (endTimeMs !== null && timer.totalSeconds > 0) {
      const remainingMs = endTimeMs - now;
      if (remainingMs <= 0) {
        return 0;
      }
      const elapsedMs = timer.totalSeconds * 1000 - remainingMs;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const remaining = timer.totalSeconds - elapsedSeconds;
      return Math.min(timer.totalSeconds, Math.max(0, remaining));
    }
  }

  if (timer.state === "paused") {
    return Math.max(0, timer.pausedRemainingSeconds);
  }

  return 0;
}

export function resolveRunningEndTimeMs(
  timer: DealerTimerSnapshot,
  now = Date.now(),
): number | null {
  if (timer.state !== "running" || timer.totalSeconds <= 0) {
    return null;
  }

  const startedAtMs = getDealerTimerStartedAtMs(timer);
  if (startedAtMs !== null && Number.isFinite(startedAtMs)) {
    return startedAtMs + timer.totalSeconds * 1000;
  }

  if (timer.endTimeMs !== null) {
    const endMs = normalizeEpochMs(timer.endTimeMs);
    if (
      isPlausibleAbsoluteMs(endMs)
      && endMs > now - 60_000
      && endMs <= now + timer.totalSeconds * 1000 + 5_000
    ) {
      return endMs;
    }
  }

  return null;
}

export function clampDealerTimerRemaining(
  remainingSeconds: number,
  totalSeconds: number,
): number {
  if (totalSeconds <= 0) {
    return Math.max(0, remainingSeconds);
  }
  return Math.min(totalSeconds, Math.max(0, remainingSeconds));
}

export function normalizeExpiredDealerTimer(
  timer: DealerTimerState,
  now = Date.now(),
): DealerTimerState {
  const endTimeMs =
    timer.endTimeMs !== null ? normalizeEpochMs(timer.endTimeMs) : null;

  if (
    timer.state === "running"
    && endTimeMs !== null
    && Number.isFinite(endTimeMs)
    && endTimeMs <= now
  ) {
    return {
      ...timer,
      mode: "idle",
      state: "stopped",
      endTimeMs: null,
      startedAtMs: null,
      pausedRemainingSeconds: 0,
      totalSeconds: 0,
      updatedAt: new Date(now).toISOString(),
    };
  }

  return timer;
}

export function toDealerTimerSnapshot(
  timer: DealerTimerState,
  now = Date.now(),
): DealerTimerSnapshot {
  const normalized = normalizeExpiredDealerTimer(timer, now);
  return {
    ...normalized,
    secondsRemaining: computeDealerTimerRemaining(normalized, now),
  };
}

/** Ignore stale poll/WS payloads that would regress a newer server revision. */
export function mergeDealerTimerSnapshot(
  current: DealerTimerSnapshot | null,
  incoming: DealerTimerSnapshot,
): DealerTimerSnapshot {
  if (!current) {
    return incoming;
  }

  if (incoming.revision > current.revision) {
    return incoming;
  }

  if (incoming.revision < current.revision) {
    return current;
  }

  // Same revision: prefer running over stopped (never regress active countdown).
  if (current.state === "running" && incoming.state !== "running") {
    if (computeDealerTimerRemaining(current) <= 0) {
      return incoming;
    }
    return current;
  }

  if (incoming.state === "running" && current.state !== "running") {
    if (incoming.secondsRemaining <= 0) {
      return {
        ...incoming,
        mode: "idle",
        state: "stopped",
        totalSeconds: 0,
        secondsRemaining: 0,
      };
    }
    return incoming;
  }

  return incoming;
}
