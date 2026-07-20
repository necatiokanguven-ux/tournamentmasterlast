import { useCallback, useEffect, useRef, useState } from "react";
import { localApi } from "../config/api";
import type { DealerTimerSnapshot } from "./dealerTimerTypes";
import { computeDealerTimerRemaining } from "./dealerTimerTypes";
import { getRingColor } from "./useLocalCountdown";

type UseSyncedDealerCountdownInput = {
  tableNumber: number;
  deviceId: string;
  serverTimer: DealerTimerSnapshot | null;
  isRegistered: boolean;
  onTimerSnapshot?: (timer: DealerTimerSnapshot) => void;
};

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

function applyTimerSnapshot(
  timer: DealerTimerSnapshot,
  setMode: (mode: DealerTimerSnapshot["mode"]) => void,
  setTimerState: (state: DealerTimerSnapshot["state"]) => void,
  setTotalSeconds: (value: number) => void,
  setSecondsRemaining: (value: number) => void,
) {
  setMode(timer.mode);
  setTimerState(timer.state);
  setTotalSeconds(timer.totalSeconds);
  setSecondsRemaining(computeDealerTimerRemaining(timer));
}

export function useSyncedDealerCountdown({
  tableNumber,
  deviceId,
  serverTimer,
  isRegistered,
  onTimerSnapshot,
}: UseSyncedDealerCountdownInput) {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [mode, setMode] = useState<DealerTimerSnapshot["mode"]>("idle");
  const [timerState, setTimerState] = useState<DealerTimerSnapshot["state"]>("stopped");
  const lastBeepSecondRef = useRef<number | null>(null);
  const revisionRef = useRef<number>(0);
  const activeTimerRef = useRef<DealerTimerSnapshot | null>(null);

  useEffect(() => {
    if (!serverTimer) {
      return;
    }

    activeTimerRef.current = serverTimer;

    if (serverTimer.revision !== revisionRef.current) {
      revisionRef.current = serverTimer.revision;
      lastBeepSecondRef.current = null;
    }

    applyTimerSnapshot(
      serverTimer,
      setMode,
      setTimerState,
      setTotalSeconds,
      setSecondsRemaining,
    );
  }, [serverTimer]);

  useEffect(() => {
    if (timerState !== "running" || !activeTimerRef.current) {
      return;
    }

    const tick = () => {
      const timer = activeTimerRef.current;
      if (!timer || timer.state !== "running") {
        return;
      }

      const remaining = computeDealerTimerRemaining(timer);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        setTimerState("stopped");
        setMode("idle");
        setTotalSeconds(0);
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 200);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [timerState, serverTimer?.revision, serverTimer?.startedAtMs]);

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
      if (!isRegistered) {
        throw new Error("DEVICE_NOT_REGISTERED");
      }

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
      activeTimerRef.current = timer;
      revisionRef.current = timer.revision;
      lastBeepSecondRef.current = null;
      applyTimerSnapshot(timer, setMode, setTimerState, setTotalSeconds, setSecondsRemaining);
      onTimerSnapshot?.(timer);
      return timer;
    },
    [deviceId, isRegistered, onTimerSnapshot, tableNumber],
  );

  const startCallTime = useCallback(() => {
    void postTimerAction("start_call");
  }, [postTimerAction]);

  const startPlayerTime = useCallback(() => {
    void postTimerAction("start_player");
  }, [postTimerAction]);

  const isActive = timerState === "running" || timerState === "paused";

  return {
    mode,
    timerState,
    secondsRemaining,
    totalSeconds,
    ringColor: getRingColor(secondsRemaining, isActive && totalSeconds > 0),
    startCallTime,
    startPlayerTime,
  };
}
