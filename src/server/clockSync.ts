import type { TournamentDatabase } from "./tournamentDatabase";
import type { DealerRotationData } from "./dealerRotation/types";

export type ClockSyncInput = {
  currentLevelIndex?: unknown;
  timeRemaining?: unknown;
  isRunning?: unknown;
  elapsedTime?: unknown;
  syncedAtMs?: unknown;
  tournamentStartedAt?: unknown;
};

export function applyClockSyncToDatabase(
  db: TournamentDatabase,
  body: ClockSyncInput,
  onTournamentClockTick?: (at: Date) => DealerRotationData,
): void {
  const syncedAtMs = Number(body.syncedAtMs) || Date.now();
  const isRunning = typeof body.isRunning === "boolean" ? body.isRunning : db.clock.isRunning;
  const elapsedTime = Number.isFinite(Number(body.elapsedTime))
    ? Math.max(0, Number(body.elapsedTime))
    : db.clock.elapsedTime;

  let tournamentStartedAt = db.clock.tournamentStartedAt ?? null;
  if (typeof body.tournamentStartedAt === "string" && body.tournamentStartedAt.trim()) {
    tournamentStartedAt = body.tournamentStartedAt;
  } else if (isRunning && !tournamentStartedAt) {
    tournamentStartedAt = new Date(syncedAtMs).toISOString();
  }

  db.clock = {
    ...db.clock,
    currentLevelIndex: Number.isFinite(Number(body.currentLevelIndex))
      ? Number(body.currentLevelIndex)
      : db.clock.currentLevelIndex,
    timeRemaining: Number.isFinite(Number(body.timeRemaining))
      ? Math.max(0, Number(body.timeRemaining))
      : db.clock.timeRemaining,
    isRunning,
    elapsedTime,
    syncedAtMs,
    tournamentStartedAt,
  };

  if (db.dealerRotation.settings.enabled && onTournamentClockTick) {
    db.dealerRotation = onTournamentClockTick(new Date(syncedAtMs));
  }
}
