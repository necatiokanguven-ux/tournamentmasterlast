import type { TrackingPlayerSearchItem } from "./types";

export function areTrackingPlayersEqual(
  current: TrackingPlayerSearchItem[],
  incoming: TrackingPlayerSearchItem[],
): boolean {
  if (current.length !== incoming.length) {
    return false;
  }

  return current.every((player, index) => {
    const next = incoming[index];
    return (
      player.id === next.id &&
      player.displayName === next.displayName &&
      player.tableNumber === next.tableNumber &&
      player.seatNumber === next.seatNumber &&
      player.status === next.status
    );
  });
}
