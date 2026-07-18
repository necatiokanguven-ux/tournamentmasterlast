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

export function useLocalCountdown(defaultCallSeconds: number, defaultPlayerSeconds: number) {
  const [mode, setMode] = useState<CountdownMode>("idle");
  const [timerState, setTimerState] = useState<CountdownState>("stopped");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const lastBeepSecondRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    setTimerState("stopped");
    setMode("idle");
    setSecondsRemaining(0);
    setTotalSeconds(0);
    lastBeepSecondRef.current = null;
  }, []);

  const startCallTime = useCallback(() => {
    setMode("call_time");
    setTimerState("running");
    setTotalSeconds(defaultCallSeconds);
    setSecondsRemaining(defaultCallSeconds);
    lastBeepSecondRef.current = null;
  }, [defaultCallSeconds]);

  const startPlayerTime = useCallback(() => {
    setMode("player_time");
    setTimerState("running");
    setTotalSeconds(defaultPlayerSeconds);
    setSecondsRemaining(defaultPlayerSeconds);
    lastBeepSecondRef.current = null;
  }, [defaultPlayerSeconds]);

  const pauseTimer = useCallback(() => {
    setTimerState((current) => (current === "running" ? "paused" : current));
  }, []);

  const resumeTimer = useCallback(() => {
    setTimerState((current) => (current === "paused" ? "running" : current));
  }, []);

  useEffect(() => {
    if (timerState !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [timerState]);

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

  useEffect(() => {
    if (secondsRemaining === 0 && timerState === "running" && totalSeconds > 0) {
      setTimerState("stopped");
    }
  }, [secondsRemaining, timerState, totalSeconds]);

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
