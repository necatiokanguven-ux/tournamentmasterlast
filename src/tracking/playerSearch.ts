import type { TrackingPlayerSearchItem } from "./types";

export function buildPlayerDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function filterPlayersByQuery(
  players: TrackingPlayerSearchItem[],
  query: string,
): TrackingPlayerSearchItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return players;
  }

  return players.filter((player) => player.displayName.toLowerCase().includes(normalized));
}
