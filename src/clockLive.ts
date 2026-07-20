import type { ClockState, TournamentSettings } from "./types";

/** Seconds until the next break (same formula as the director clock screen). */
export function calculateTimeToNextBreakSeconds(
  settings: TournamentSettings,
  clock: ClockState,
): number {
  let secs = clock.timeRemaining;

  for (let i = clock.currentLevelIndex + 1; i < settings.blindStructure.length; i++) {
    const level = settings.blindStructure[i];
    if (level.isBreak) {
      break;
    }
    secs += level.duration * 60;
  }

  return secs;
}

export function formatClockDuration(secs: number): string {
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function formatClockMinutesSeconds(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function calculateTimeToNextBreakLabel(
  settings: TournamentSettings,
  clock: ClockState,
): string {
  return formatClockDuration(calculateTimeToNextBreakSeconds(settings, clock));
}

/**
 * Extrapolate the live tournament clock from the last server sync anchor.
 * Director pushes timeRemaining + syncedAtMs together every second while running.
 */
export function getEffectiveClock(clock: ClockState): ClockState {
  if (!clock.isRunning || clock.syncedAtMs == null) {
    return clock;
  }

  const elapsed = Math.floor((Date.now() - clock.syncedAtMs) / 1000);
  if (elapsed <= 0) {
    return clock;
  }

  return {
    ...clock,
    timeRemaining: Math.max(0, clock.timeRemaining - elapsed),
  };
}
