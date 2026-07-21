import { useCallback, useEffect, useRef, useState } from "react";
import { localApi } from "../config/api";
import type { DealerTimerSnapshot } from "./dealerTimerTypes";
import {
  clampDealerTimerRemaining,
  computeDealerTimerRemaining,
  createDefaultDealerTimerState,
  getDealerTimerStartedAtMs,
  resolveRunningEndTimeMs,
} from "./dealerTimerTypes";
import { getRingColor } from "./useLocalCountdown";

type UseSyncedDealerCountdownInput = {
  tableNumber: number;
  deviceId: string;
  serverTimer: DealerTimerSnapshot | null;
  isRegistered: boolean;
  callTimeSeconds: number;
  playerTimeSeconds: number;
  onTimerSnapshot?: (timer: DealerTimerSnapshot) => void;
};

const REGISTRATION_WAIT_MS = 4_000;
const REGISTRATION_POLL_MS = 50;

function playBeep() {
  try {
    const AudioContextClass =
      window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // ignore audio failures
  }
}

/** Display seconds left — transitions exactly on each full elapsed second. */
function readRemainingFromEnd(endTimeMs: number, totalSeconds: number): number {
  const remainingMs = endTimeMs - Date.now();
  if (remainingMs <= 0) {
    return 0;
  }
  const elapsedMs = totalSeconds * 1000 - remainingMs;
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return clampDealerTimerRemaining(totalSeconds - elapsedSeconds, totalSeconds);
}

function alignEndTimeMs(totalSeconds: number, now = Date.now()): number {
  const startedAtMs = Math.floor(now / 1000) * 1000;
  return startedAtMs + totalSeconds * 1000;
}

function anchorFromServerTimer(timer: DealerTimerSnapshot): {
  remainingSeconds: number;
  endTimeMs: number;
  startedAtMs: number;
  totalSeconds: number;
} {
  const totalSeconds = Math.max(1, timer.totalSeconds);
  const startedAtMs = getDealerTimerStartedAtMs(timer) ?? Date.now();
  const endTimeMs = resolveRunningEndTimeMs(timer) ?? startedAtMs + totalSeconds * 1000;
  const remainingSeconds = computeDealerTimerRemaining(timer);
  return { remainingSeconds, endTimeMs, startedAtMs, totalSeconds };
}

function waitForRegistration(isRegisteredRef: { current: boolean }): Promise<boolean> {
  if (isRegisteredRef.current) {
    return Promise.resolve(true);
  }

  const deadline = Date.now() + REGISTRATION_WAIT_MS;
  return new Promise((resolve) => {
    const tick = () => {
      if (isRegisteredRef.current) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, REGISTRATION_POLL_MS);
    };
    tick();
  });
}

export function useSyncedDealerCountdown({
  tableNumber,
  deviceId,
  serverTimer,
  isRegistered,
  callTimeSeconds,
  playerTimeSeconds,
  onTimerSnapshot,
}: UseSyncedDealerCountdownInput) {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [mode, setMode] = useState<DealerTimerSnapshot["mode"]>("idle");
  const [timerState, setTimerState] = useState<DealerTimerSnapshot["state"]>("stopped");
  const [tickSessionId, setTickSessionId] = useState(0);
  const lastBeepSecondRef = useRef<number | null>(null);
  const revisionRef = useRef<number>(0);
  const endTimeMsRef = useRef<number | null>(null);
  const startedAtMsRef = useRef<number | null>(null);
  const totalSecondsRef = useRef<number>(0);
  const timerStateRef = useRef<DealerTimerSnapshot["state"]>("stopped");
  const pendingLocalStartRef = useRef(false);
  const localCompletedRevisionRef = useRef<number | null>(null);
  const isRegisteredRef = useRef(isRegistered);

  useEffect(() => {
    isRegisteredRef.current = isRegistered;
  }, [isRegistered]);

  const setTimerStateTracked = useCallback((next: DealerTimerSnapshot["state"]) => {
    timerStateRef.current = next;
    setTimerState(next);
  }, []);

  const startLocalCountdown = useCallback(
    (nextMode: DealerTimerSnapshot["mode"], durationSeconds: number) => {
      const total = Math.max(1, Math.round(durationSeconds));
      const endTimeMs = alignEndTimeMs(total);
      const startedAtMs = endTimeMs - total * 1000;
      localCompletedRevisionRef.current = null;
      startedAtMsRef.current = startedAtMs;
      endTimeMsRef.current = endTimeMs;
      totalSecondsRef.current = total;
      lastBeepSecondRef.current = null;
      setMode(nextMode);
      setTotalSeconds(total);
      setSecondsRemaining(total);
      setTimerStateTracked("running");
      setTickSessionId((current) => current + 1);
    },
    [setTimerStateTracked],
  );

  const resetLocalCountdown = useCallback(() => {
    pendingLocalStartRef.current = false;
    endTimeMsRef.current = null;
    startedAtMsRef.current = null;
    totalSecondsRef.current = 0;
    lastBeepSecondRef.current = null;
    setMode("idle");
    setTotalSeconds(0);
    setSecondsRemaining(0);
    setTimerStateTracked("stopped");
  }, [setTimerStateTracked]);

  const applyStoppedTimer = useCallback(
    (timer: DealerTimerSnapshot) => {
      endTimeMsRef.current = null;
      startedAtMsRef.current = null;
      totalSecondsRef.current = timer.totalSeconds;
      setMode(timer.mode);
      setTimerStateTracked(timer.state);
      setTotalSeconds(timer.totalSeconds);
      setSecondsRemaining(computeDealerTimerRemaining(timer));
    },
    [setTimerStateTracked],
  );

  const beginRunningTimer = useCallback(
    (timer: DealerTimerSnapshot, forceReanchor: boolean) => {
      const { remainingSeconds, endTimeMs, startedAtMs, totalSeconds: total } =
        anchorFromServerTimer(timer);

      if (remainingSeconds <= 0) {
        localCompletedRevisionRef.current = timer.revision;
        applyStoppedTimer({
          ...timer,
          mode: "idle",
          state: "stopped",
          totalSeconds: 0,
          secondsRemaining: 0,
        });
        return;
      }

      if (
        !forceReanchor
        && timerStateRef.current === "running"
        && timer.revision === revisionRef.current
        && endTimeMsRef.current !== null
      ) {
        return;
      }

      // Only preserve optimistic tablet start — never ignore a remote (phone) trigger.
      if (
        forceReanchor
        && pendingLocalStartRef.current
        && timerStateRef.current === "running"
        && endTimeMsRef.current !== null
        && totalSecondsRef.current === total
        && endTimeMsRef.current <= endTimeMs + 1500
      ) {
        revisionRef.current = timer.revision;
        pendingLocalStartRef.current = false;
        localCompletedRevisionRef.current = null;
        return;
      }

      localCompletedRevisionRef.current = null;
      endTimeMsRef.current = endTimeMs;
      startedAtMsRef.current = startedAtMs;
      totalSecondsRef.current = total;
      lastBeepSecondRef.current = null;
      setMode(timer.mode);
      setTotalSeconds(total);
      setSecondsRemaining(remainingSeconds);
      setTimerStateTracked("running");
      setTickSessionId((current) => current + 1);
    },
    [applyStoppedTimer, setTimerStateTracked],
  );

  const applyServerTimer = useCallback(
    (timer: DealerTimerSnapshot) => {
      if (timer.revision < revisionRef.current) {
        return;
      }

      if (
        pendingLocalStartRef.current
        && timer.state !== "running"
        && timer.revision <= revisionRef.current
      ) {
        return;
      }

      if (
        timer.revision === revisionRef.current
        && timerStateRef.current === "running"
        && timer.state !== "running"
      ) {
        return;
      }

      const revisionChanged = timer.revision !== revisionRef.current;
      if (revisionChanged) {
        revisionRef.current = timer.revision;
        lastBeepSecondRef.current = null;
        pendingLocalStartRef.current = false;
      }

      if (timer.state === "running") {
        if (timer.revision === localCompletedRevisionRef.current) {
          applyStoppedTimer({
            ...timer,
            mode: "idle",
            state: "stopped",
            totalSeconds: 0,
            secondsRemaining: 0,
          });
          return;
        }

        beginRunningTimer(timer, revisionChanged);
        return;
      }

      applyStoppedTimer(timer);
    },
    [applyStoppedTimer, beginRunningTimer],
  );

  useEffect(() => {
    if (!serverTimer) {
      return;
    }

    applyServerTimer(serverTimer);
  }, [applyServerTimer, serverTimer]);

  useEffect(() => {
    if (timerState !== "running" || endTimeMsRef.current === null) {
      return;
    }

    const tick = () => {
      const endTimeMs = endTimeMsRef.current;
      if (endTimeMs === null) {
        return;
      }

      const remaining = readRemainingFromEnd(endTimeMs, totalSecondsRef.current);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        localCompletedRevisionRef.current = revisionRef.current;
        endTimeMsRef.current = null;
        startedAtMsRef.current = null;
        totalSecondsRef.current = 0;
        pendingLocalStartRef.current = false;
        setTimerStateTracked("stopped");
        setMode("idle");
        setTotalSeconds(0);
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [timerState, tickSessionId, setTimerStateTracked]);

  useEffect(() => {
    if (timerState !== "running" || secondsRemaining <= 0) {
      return;
    }

    const shouldBeep =
      secondsRemaining === 10
      || secondsRemaining === 5
      || (secondsRemaining >= 1 && secondsRemaining < 5);

    if (!shouldBeep || lastBeepSecondRef.current === secondsRemaining) {
      return;
    }

    lastBeepSecondRef.current = secondsRemaining;
    playBeep();
  }, [secondsRemaining, timerState]);

  const postTimerAction = useCallback(
    async (action: "start_call" | "start_player" | "pause" | "resume" | "reset") => {
      const response = await fetch(localApi(`/api/dealer/table/${tableNumber}/timer`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, deviceId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "TIMER_ACTION_FAILED");
      }

      const timer = data.dealerTimer as DealerTimerSnapshot;
      const wasLocalStart = pendingLocalStartRef.current;
      revisionRef.current = timer.revision;
      pendingLocalStartRef.current = false;
      lastBeepSecondRef.current = null;

      if (timer.state === "running") {
        const alreadyRunningFromLocalStart =
          wasLocalStart
          && timerStateRef.current === "running"
          && endTimeMsRef.current !== null
          && totalSecondsRef.current === Math.max(1, timer.totalSeconds);

        if (!alreadyRunningFromLocalStart) {
          beginRunningTimer(timer, true);
        } else {
          localCompletedRevisionRef.current = null;
        }
      } else {
        applyStoppedTimer(timer);
      }

      onTimerSnapshot?.(timer);
      return timer;
    },
    [applyStoppedTimer, beginRunningTimer, deviceId, onTimerSnapshot, tableNumber],
  );

  const startCallTime = useCallback(() => {
    pendingLocalStartRef.current = true;
    startLocalCountdown("call_time", callTimeSeconds);

    void (async () => {
      const registered = await waitForRegistration(isRegisteredRef);
      if (!registered) {
        resetLocalCountdown();
        applyStoppedTimer({
          ...createDefaultDealerTimerState(),
          secondsRemaining: 0,
        });
        return;
      }

      try {
        await postTimerAction("start_call");
      } catch {
        resetLocalCountdown();
        applyStoppedTimer({
          ...createDefaultDealerTimerState(),
          secondsRemaining: 0,
        });
      }
    })();
  }, [
    applyStoppedTimer,
    callTimeSeconds,
    postTimerAction,
    resetLocalCountdown,
    startLocalCountdown,
  ]);

  const startPlayerTime = useCallback(() => {
    pendingLocalStartRef.current = true;
    startLocalCountdown("player_time", playerTimeSeconds);

    void (async () => {
      const registered = await waitForRegistration(isRegisteredRef);
      if (!registered) {
        resetLocalCountdown();
        applyStoppedTimer({
          ...createDefaultDealerTimerState(),
          secondsRemaining: 0,
        });
        return;
      }

      try {
        await postTimerAction("start_player");
      } catch {
        resetLocalCountdown();
        applyStoppedTimer({
          ...createDefaultDealerTimerState(),
          secondsRemaining: 0,
        });
      }
    })();
  }, [
    applyStoppedTimer,
    playerTimeSeconds,
    postTimerAction,
    resetLocalCountdown,
    startLocalCountdown,
  ]);

  const isActive = timerState === "running" || timerState === "paused";

  return {
    mode,
    timerState,
    secondsRemaining,
    totalSeconds,
    ringColor: getRingColor(secondsRemaining, isActive && totalSeconds > 0),
    startCallTime,
    startPlayerTime,
    applyWireTimer: applyServerTimer,
  };
}
