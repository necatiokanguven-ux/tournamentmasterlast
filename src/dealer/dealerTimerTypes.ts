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

export function getDealerTimerStartedAtMs(timer: DealerTimerState): number | null {
  if (timer.startedAtMs !== null) {
    return timer.startedAtMs;
  }

  if (timer.endTimeMs !== null && timer.totalSeconds > 0) {
    return timer.endTimeMs - timer.totalSeconds * 1000;
  }

  return null;
}

export function computeDealerTimerRemaining(
  timer: DealerTimerState,
  now = Date.now(),
): number {
  if (timer.state === "running") {
    const startedAtMs = getDealerTimerStartedAtMs(timer);
    if (startedAtMs !== null && timer.totalSeconds > 0) {
      const elapsedSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
      const remaining = timer.totalSeconds - elapsedSeconds;
      return Math.min(timer.totalSeconds, Math.max(0, remaining));
    }
  }

  if (timer.state === "paused") {
    return Math.max(0, timer.pausedRemainingSeconds);
  }

  return 0;
}

export function normalizeExpiredDealerTimer(
  timer: DealerTimerState,
  now = Date.now(),
): DealerTimerState {
  if (
    timer.state === "running"
    && timer.endTimeMs !== null
    && timer.endTimeMs <= now
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
