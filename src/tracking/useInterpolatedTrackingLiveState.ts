import { useEffect, useMemo, useState } from "react";
import { getEffectiveClock } from "../clockLive";
import type { ClockState } from "../types";
import type { TrackingLiveState } from "./liveState";

/**
 * Smooth QR tracking clock between sparse polls using the server sync anchor.
 * Only used on /track — dealer/floor/operator flows are unchanged.
 */
export function useInterpolatedTrackingLiveState(
  liveState: TrackingLiveState | null,
): TrackingLiveState | null {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!liveState?.isRunning || liveState.syncedAtMs == null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [liveState?.isRunning, liveState?.syncedAtMs, liveState?.timeRemaining]);

  return useMemo(() => {
    if (!liveState) {
      return null;
    }

    if (!liveState.isRunning || liveState.syncedAtMs == null) {
      return liveState;
    }

    const clockSlice: ClockState = {
      currentLevelIndex: liveState.currentLevelIndex,
      timeRemaining: liveState.timeRemaining,
      isRunning: liveState.isRunning,
      elapsedTime: 0,
      soundEnabled: false,
      fullscreen: false,
      syncedAtMs: liveState.syncedAtMs,
    };

    const effective = getEffectiveClock(clockSlice);
    if (effective.timeRemaining === liveState.timeRemaining) {
      return liveState;
    }

    return {
      ...liveState,
      timeRemaining: effective.timeRemaining,
    };
  }, [liveState, tick]);
}
