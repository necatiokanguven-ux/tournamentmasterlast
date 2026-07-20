import type { ClockState } from "../../types";

/** Wire format for the `clock` WebSocket channel (Phase 5A). */
export type ClockChannelPayload = Pick<
  ClockState,
  "currentLevelIndex" | "timeRemaining" | "isRunning" | "elapsedTime" | "syncedAtMs" | "tournamentStartedAt"
>;

export function buildClockChannelPayload(clock: ClockState): ClockChannelPayload {
  return {
    currentLevelIndex: clock.currentLevelIndex,
    timeRemaining: clock.timeRemaining,
    isRunning: clock.isRunning,
    elapsedTime: clock.elapsedTime,
    syncedAtMs: clock.syncedAtMs ?? null,
    tournamentStartedAt: clock.tournamentStartedAt ?? null,
  };
}

export function clockChannelVersion(clock: ClockChannelPayload): number {
  return clock.syncedAtMs ?? Date.now();
}

export function isClockChannelPayload(value: unknown): value is ClockChannelPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ClockChannelPayload>;
  return (
    Number.isFinite(Number(payload.currentLevelIndex))
    && Number.isFinite(Number(payload.timeRemaining))
    && typeof payload.isRunning === "boolean"
    && Number.isFinite(Number(payload.elapsedTime))
  );
}
