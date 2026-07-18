import type { Player } from "../types";
import type { TournamentDatabase } from "./tournamentDatabase";
import { findTableByNumber } from "./tournamentDatabase";

export type TableSeatSnapshot = {
  seatNumber: number;
  seatIndex: number;
  playerId: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  country: string | null;
  status: Player["status"] | null;
  isOpen: boolean;
};

export function buildSeatSnapshot(db: TournamentDatabase, tableNumber: number) {
  const table = findTableByNumber(db, tableNumber);
  if (!table) return null;

  const seats: TableSeatSnapshot[] = table.seats.map((playerId, seatIndex) => {
    if (!playerId) {
      return {
        seatNumber: seatIndex + 1,
        seatIndex,
        playerId: null,
        firstName: null,
        lastName: null,
        displayName: null,
        country: null,
        status: null,
        isOpen: true,
      };
    }

    const player = db.players.find((entry) => entry.id === playerId);
    if (!player || player.status === "Eliminated") {
      return {
        seatNumber: seatIndex + 1,
        seatIndex,
        playerId: null,
        firstName: null,
        lastName: null,
        displayName: null,
        country: null,
        status: null,
        isOpen: true,
      };
    }

    return {
      seatNumber: seatIndex + 1,
      seatIndex,
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      displayName: `${player.firstName} ${player.lastName}`.trim(),
      country: player.country,
      status: player.status,
      isOpen: false,
    };
  });

  return { table, seats };
}
