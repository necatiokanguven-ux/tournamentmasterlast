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

export function useLocalCountdown(defaultCallSeconds: number, defaultPlayerSeconds: number) {
  const [mode, setMode] = useState<CountdownMode>("idle");
  const [timerState, setTimerState] = useState<CountdownState>("stopped");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [sessionId, setSessionId] = useState(0);
  const endTimeRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef(0);
  const lastBeepSecondRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearTickInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    clearTickInterval();
    setTimerState("stopped");
    setMode("idle");
    setSecondsRemaining(0);
    setTotalSeconds(0);
    endTimeRef.current = null;
    pausedRemainingRef.current = 0;
    lastBeepSecondRef.current = null;
  }, [clearTickInterval]);

  const beginCountdown = useCallback((nextMode: CountdownMode, durationSeconds: number) => {
    const duration = Math.max(1, Math.round(durationSeconds));
    clearTickInterval();
    endTimeRef.current = Date.now() + duration * 1000;
    pausedRemainingRef.current = 0;
    lastBeepSecondRef.current = null;
    setMode(nextMode);
    setTotalSeconds(duration);
    setSecondsRemaining(duration);
    setTimerState("running");
    setSessionId((current) => current + 1);
  }, [clearTickInterval]);

  const startCallTime = useCallback(() => {
    beginCountdown("call_time", defaultCallSeconds);
  }, [beginCountdown, defaultCallSeconds]);

  const startPlayerTime = useCallback(() => {
    beginCountdown("player_time", defaultPlayerSeconds);
  }, [beginCountdown, defaultPlayerSeconds]);

  const pauseTimer = useCallback(() => {
    if (endTimeRef.current === null) return;

    clearTickInterval();
    const remaining = readRemainingSeconds(endTimeRef.current);
    pausedRemainingRef.current = remaining;
    setSecondsRemaining(remaining);
    endTimeRef.current = null;
    setTimerState("paused");
  }, [clearTickInterval]);

  const resumeTimer = useCallback(() => {
    if (timerState !== "paused" || pausedRemainingRef.current <= 0) {
      return;
    }

    beginCountdown(mode === "player_time" ? "player_time" : "call_time", pausedRemainingRef.current);
  }, [beginCountdown, mode, timerState]);

  useEffect(() => {
    if (timerState !== "running" || endTimeRef.current === null) {
      clearTickInterval();
      return;
    }

    const tick = () => {
      const endTime = endTimeRef.current;
      if (endTime === null) return;

      const remaining = readRemainingSeconds(endTime);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        endTimeRef.current = null;
        setTimerState("stopped");
        clearTickInterval();
      }
    };

    tick();
    intervalRef.current = window.setInterval(tick, 200);

    return () => {
      clearTickInterval();
    };
  }, [timerState, sessionId, clearTickInterval]);

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
