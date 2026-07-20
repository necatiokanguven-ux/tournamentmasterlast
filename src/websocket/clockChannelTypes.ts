/** Client-side clock channel payload (mirrors server Phase 5A). */

export type ClockChannelPayload = {
  currentLevelIndex: number;
  timeRemaining: number;
  isRunning: boolean;
  elapsedTime: number;
  syncedAtMs: number | null;
  tournamentStartedAt?: string | null;
};

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
