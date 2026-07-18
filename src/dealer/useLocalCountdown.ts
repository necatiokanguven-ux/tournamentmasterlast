import { useCallback, useEffect, useRef, useState } from "react";

export type CountdownMode = "idle" | "call_time" | "player_time";
export type CountdownState = "stopped" | "running" | "paused";

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

export function getRingColor(secondsRemaining: number, active: boolean): string {
  if (!active || secondsRemaining <= 0) return "#3f3f46";
  if (secondsRemaining <= 5) return "#ef4444";
  if (secondsRemaining <= 10) return "#eab308";
  return "#22c55e";
}

function readRemainingSeconds(endTimeMs: number): number {
  return Math.max(0, Math.ceil((endTimeMs - Date.now()) / 1000));
}

function msUntilNextSecond(endTimeMs: number): number {
  const msRemaining = endTimeMs - Date.now();
  if (msRemaining <= 0) return 0;
  const displayed = Math.ceil(msRemaining / 1000);
  const nextBoundaryMs = msRemaining - (displayed - 1) * 1000;
  return Math.max(0, nextBoundaryMs);
}

export function useLocalCountdown(defaultCallSeconds: number, defaultPlayerSeconds: number) {
  const [mode, setMode] = useState<CountdownMode>("idle");
  const [timerState, setTimerState] = useState<CountdownState>("stopped");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const endTimeRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef(0);
  const lastBeepSecondRef = useRef<number | null>(null);
  const tickTimeoutRef = useRef<number | null>(null);

  const clearTickTimeout = useCallback(() => {
    if (tickTimeoutRef.current !== null) {
      window.clearTimeout(tickTimeoutRef.current);
      tickTimeoutRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    clearTickTimeout();
    setTimerState("stopped");
    setMode("idle");
    setSecondsRemaining(0);
    setTotalSeconds(0);
    endTimeRef.current = null;
    pausedRemainingRef.current = 0;
    lastBeepSecondRef.current = null;
  }, [clearTickTimeout]);

  const startCallTime = useCallback(() => {
    clearTickTimeout();
    setMode("call_time");
    setTimerState("running");
    setTotalSeconds(defaultCallSeconds);
    setSecondsRemaining(defaultCallSeconds);
    endTimeRef.current = Date.now() + defaultCallSeconds * 1000;
    pausedRemainingRef.current = 0;
    lastBeepSecondRef.current = null;
  }, [clearTickTimeout, defaultCallSeconds]);

  const startPlayerTime = useCallback(() => {
    clearTickTimeout();
    setMode("player_time");
    setTimerState("running");
    setTotalSeconds(defaultPlayerSeconds);
    setSecondsRemaining(defaultPlayerSeconds);
    endTimeRef.current = Date.now() + defaultPlayerSeconds * 1000;
    pausedRemainingRef.current = 0;
    lastBeepSecondRef.current = null;
  }, [clearTickTimeout, defaultPlayerSeconds]);

  const pauseTimer = useCallback(() => {
    if (endTimeRef.current === null) return;

    clearTickTimeout();
    const remaining = readRemainingSeconds(endTimeRef.current);
    pausedRemainingRef.current = remaining;
    setSecondsRemaining(remaining);
    endTimeRef.current = null;
    setTimerState("paused");
  }, [clearTickTimeout]);

  const resumeTimer = useCallback(() => {
    setTimerState((current) => {
      if (current !== "paused" || pausedRemainingRef.current <= 0) {
        return current;
      }
      endTimeRef.current = Date.now() + pausedRemainingRef.current * 1000;
      return "running";
    });
  }, []);

  useEffect(() => {
    if (timerState !== "running" || endTimeRef.current === null) {
      clearTickTimeout();
      return;
    }

    const scheduleTick = () => {
      const endTime = endTimeRef.current;
      if (endTime === null) return;

      const remaining = readRemainingSeconds(endTime);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        endTimeRef.current = null;
        setTimerState("stopped");
        tickTimeoutRef.current = null;
        return;
      }

      tickTimeoutRef.current = window.setTimeout(scheduleTick, msUntilNextSecond(endTime));
    };

    scheduleTick();

    return () => {
      clearTickTimeout();
    };
  }, [timerState, clearTickTimeout]);

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

  const isActive = timerState === "running" || timerState === "paused";

  return {
    mode,
    timerState,
    secondsRemaining,
    totalSeconds,
    ringColor: getRingColor(secondsRemaining, isActive && totalSeconds > 0),
    startCallTime,
    startPlayerTime,
    pauseTimer,
    resumeTimer,
    resetTimer,
  };
}
