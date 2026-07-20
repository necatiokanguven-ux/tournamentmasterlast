import type { FloorCall } from "../../types";
import type { TournamentDatabase } from "../tournamentDatabase";
import { getActiveFloorCallsForTeam } from "../tournamentOperations";
import { buildSeatSnapshot } from "../tableSnapshot";

export type FloorTableSnapshot = {
  tableNumber: number;
  tableId: string;
  occupants: number;
  seats: Array<{
    seatNumber: number;
    seatIndex: number;
    playerId: string | null;
    displayName: string | null;
    isOpen: boolean;
    status: string | null;
  }>;
};

export type FloorChannelPayload = {
  version: number;
  teamId: string;
  teamName: string;
  tableNumbers: number[];
  calls: FloorCall[];
  tables: FloorTableSnapshot[];
};

export function parseFloorChannel(channel: string): string | null {
  const match = channel.match(/^floor:(.+)$/);
  return match?.[1]?.trim() || null;
}

export function buildFloorChannelPayload(db: TournamentDatabase, teamId: string): FloorChannelPayload | null {
  const team = (db.settings.floorTeams ?? []).find(entry => entry.id === teamId);
  if (!team) return null;

  const tables = team.tableNumbers
    .map((tableNumber) => {
      const snapshot = buildSeatSnapshot(db, tableNumber);
      if (!snapshot) return null;

      return {
        tableNumber: snapshot.table.number,
        tableId: snapshot.table.id,
        occupants: snapshot.seats.filter(seat => !seat.isOpen).length,
        seats: snapshot.seats.map(seat => ({
          seatNumber: seat.seatNumber,
          seatIndex: seat.seatIndex,
          playerId: seat.playerId,
          displayName: seat.displayName,
          isOpen: seat.isOpen,
          status: seat.status as string | null,
        })),
      };
    })
    .filter((entry): entry is FloorTableSnapshot => entry !== null)
    .sort((a, b) => b.occupants - a.occupants || a.tableNumber - b.tableNumber);

  return {
    version: db.meta.lastModified,
    teamId: team.id,
    teamName: team.name,
    tableNumbers: team.tableNumbers,
    calls: getActiveFloorCallsForTeam(db, teamId),
    tables,
  };
}

export function floorTeamsWithSubscribers(
  db: TournamentDatabase,
  subscribedChannels: Iterable<string>,
): string[] {
  const subscribed = new Set(subscribedChannels);
  return (db.settings.floorTeams ?? [])
    .map(team => team.id)
    .filter(teamId => subscribed.has(`floor:${teamId}`));
}
