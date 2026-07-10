import type { PlayerStatus } from "../types";

export const TRACKING_ACTIVE_STATUSES = new Set<PlayerStatus>([
  "Registered",
  "Playing",
  "Waiting",
  "Re-entry",
]);

export function isTrackingActivePlayer(status: PlayerStatus): boolean {
  return TRACKING_ACTIVE_STATUSES.has(status);
}

export function isTrackingEliminatedPlayer(status: PlayerStatus): boolean {
  return status === "Eliminated";
}
