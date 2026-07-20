import type { TournamentDatabase } from "./tournamentDatabase";
import {
  bumpDatabaseMeta,
  findFloorTeamForTable,
  findTableByNumber,
} from "./tournamentDatabase";
import { buildSeatSnapshot } from "./tableSnapshot";
import type { FloorCall, HistoryEvent, Player } from "../types";

function isPlayerSeatedOnTables(playerId: string, db: TournamentDatabase): boolean {
  return db.tables.some((table) => table.seats.includes(playerId));
}

function reconcileTableSeats(db: TournamentDatabase): void {
  const playerIds = new Set(db.players.map((player) => player.id));

  db.tables = db.tables.map((table) => ({
    ...table,
    seats: table.seats.map((seatId) => {
      if (!seatId || !playerIds.has(seatId)) return null;
      const seatedPlayer = db.players.find((player) => player.id === seatId);
      if (!seatedPlayer || seatedPlayer.status === "Eliminated") return null;
      return seatId;
    }),
  }));

  db.players = db.players.map((player) => {
    const seatedAt = isPlayerSeatedOnTables(player.id, db);
    if (player.status === "Eliminated" && (player.tableId || player.seatIndex !== null)) {
      return { ...player, tableId: null, seatIndex: null };
    }
    if (!seatedAt && player.tableId) {
      return { ...player, tableId: null, seatIndex: null };
    }
    return player;
  });
}

function addHistoryEvent(
  db: TournamentDatabase,
  type: HistoryEvent["type"],
  description: string,
  playerId?: string,
  playerName?: string,
): HistoryEvent {
  const event: HistoryEvent = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    playerId,
    playerName,
    description,
  };
  db.history.unshift(event);
  if (db.history.length > 10000) {
    db.history.pop();
  }
  return event;
}

export function bustPlayerOnTable(
  db: TournamentDatabase,
  tableNumber: number,
  playerId: string,
): { ok: true } | { ok: false; error: string } {
  const table = findTableByNumber(db, tableNumber);
  if (!table) {
    return { ok: false, error: "TABLE_NOT_FOUND" };
  }

  if (!table.seats.includes(playerId)) {
    return { ok: false, error: "PLAYER_NOT_AT_TABLE" };
  }

  const player = db.players.find((entry) => entry.id === playerId);
  if (!player || player.status === "Eliminated") {
    return { ok: false, error: "PLAYER_NOT_ELIGIBLE" };
  }

  const playingPlayers = db.players.filter(
    (entry) => entry.status === "Playing" || entry.status === "Waiting",
  );
  const elimOrder = playingPlayers.length;
  const playerName = `${player.firstName} ${player.lastName}`;

  db.players = db.players.map((entry) =>
    entry.id === playerId
      ? {
          ...entry,
          status: "Eliminated" as Player["status"],
          chips: 0,
          eliminationOrder: elimOrder,
          tableId: null,
          seatIndex: null,
        }
      : entry,
  );

  db.tables = db.tables.map((entry) =>
    entry.id === table.id
      ? {
          ...entry,
          seats: entry.seats.map((seatId) => (seatId === playerId ? null : seatId)),
        }
      : entry,
  );

  reconcileTableSeats(db);
  addHistoryEvent(db, "bust", `${playerName} eliminated`, playerId, playerName);
  createPlayerEliminatedFloorCall(db, tableNumber, playerId, playerName);
  bumpDatabaseMeta(db);
  return { ok: true };
}

export function createPlayerEliminatedFloorCall(
  db: TournamentDatabase,
  tableNumber: number,
  playerId: string,
  playerName: string,
): FloorCall | null {
  const table = findTableByNumber(db, tableNumber);
  if (!table) {
    return null;
  }

  const team = findFloorTeamForTable(db, tableNumber);
  if (!team) {
    return null;
  }

  const call: FloorCall = {
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tableNumber,
    tableId: table.id,
    teamId: team.id,
    kind: "player_eliminated",
    playerId,
    playerName,
    status: "pending",
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
  };

  db.floorCalls.unshift(call);
  return call;
}

export function createFloorCall(
  db: TournamentDatabase,
  tableNumber: number,
): { ok: true; call: FloorCall } | { ok: false; error: string; message?: string } {
  const table = findTableByNumber(db, tableNumber);
  if (!table) {
    return { ok: false, error: "TABLE_NOT_FOUND", message: "Table not found." };
  }

  const team = findFloorTeamForTable(db, tableNumber);
  if (!team) {
    return {
      ok: false,
      error: "FLOOR_TEAM_NOT_ASSIGNED",
      message: "This table is not assigned to a floor team. Update Floor Setup.",
    };
  }

  const existingPending = db.floorCalls.find(
    (call) =>
      call.tableNumber === tableNumber &&
      (call.status === "pending" || call.status === "acknowledged"),
  );

  if (existingPending) {
    return { ok: true, call: existingPending };
  }

  const call: FloorCall = {
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tableNumber,
    tableId: table.id,
    teamId: team.id,
    kind: "floor_request",
    playerId: null,
    playerName: null,
    status: "pending",
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
  };

  db.floorCalls.unshift(call);
  bumpDatabaseMeta(db);
  return { ok: true, call };
}

export function acknowledgeFloorCall(
  db: TournamentDatabase,
  callId: string,
  teamId: string,
  acknowledgedBy: string,
): { ok: true; call: FloorCall } | { ok: false; error: string; message?: string } {
  const call = db.floorCalls.find((entry) => entry.id === callId);
  if (!call) {
    return { ok: false, error: "CALL_NOT_FOUND" };
  }

  if (call.teamId !== teamId) {
    return { ok: false, error: "WRONG_TEAM" };
  }

  if (call.status === "resolved") {
    return { ok: false, error: "CALL_RESOLVED" };
  }

  if (call.status === "acknowledged") {
    return {
      ok: false,
      error: "ALREADY_ACKNOWLEDGED",
      message: call.acknowledgedBy
        ? `${call.acknowledgedBy} is already responding.`
        : "Another floor member is already responding.",
    };
  }

  call.status = "acknowledged";
  call.acknowledgedAt = new Date().toISOString();
  call.acknowledgedBy = acknowledgedBy || "Floor";
  bumpDatabaseMeta(db);
  return { ok: true, call };
}

export function resolveFloorCall(
  db: TournamentDatabase,
  callId: string,
  teamId: string,
): { ok: true; call: FloorCall } | { ok: false; error: string } {
  const call = db.floorCalls.find((entry) => entry.id === callId);
  if (!call) {
    return { ok: false, error: "CALL_NOT_FOUND" };
  }

  if (call.teamId !== teamId) {
    return { ok: false, error: "WRONG_TEAM" };
  }

  call.status = "resolved";
  call.resolvedAt = new Date().toISOString();
  bumpDatabaseMeta(db);
  return { ok: true, call };
}

export function getActiveFloorCallsForTeam(db: TournamentDatabase, teamId: string): FloorCall[] {
  return db.floorCalls.filter(
    (call) =>
      call.teamId === teamId &&
      (call.status === "pending" || call.status === "acknowledged"),
  );
}

export function getMoveTargetTables(db: TournamentDatabase) {
  return db.tables
    .map((table) => {
      const snapshot = buildSeatSnapshot(db, table.number);
      if (!snapshot) return null;

      const emptySeats = snapshot.seats
        .filter((seat) => seat.isOpen)
        .map((seat) => ({
          seatNumber: seat.seatNumber,
          seatIndex: seat.seatIndex,
        }));

      return {
        tableNumber: table.number,
        tableId: table.id,
        occupants: snapshot.seats.filter((seat) => !seat.isOpen).length,
        emptySeats,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.tableNumber - b.tableNumber);
}

function isPlayerOnTeamTables(db: TournamentDatabase, teamId: string, playerId: string): boolean {
  const team = (db.settings.floorTeams ?? []).find((entry) => entry.id === teamId);
  if (!team) return false;

  for (const tableNumber of team.tableNumbers) {
    const table = findTableByNumber(db, tableNumber);
    if (table?.seats.includes(playerId)) {
      return true;
    }
  }

  return false;
}

export function movePlayerToSeat(
  db: TournamentDatabase,
  teamId: string,
  playerId: string,
  targetTableNumber: number,
  targetSeatIndex: number,
): { ok: true } | { ok: false; error: string; message?: string } {
  const team = (db.settings.floorTeams ?? []).find((entry) => entry.id === teamId);
  if (!team) {
    return { ok: false, error: "TEAM_NOT_FOUND" };
  }

  if (!isPlayerOnTeamTables(db, teamId, playerId)) {
    return {
      ok: false,
      error: "PLAYER_NOT_ON_ASSIGNED_TABLE",
      message: "Player is not seated on a table assigned to this floor team.",
    };
  }

  const player = db.players.find((entry) => entry.id === playerId);
  if (!player || player.status === "Eliminated") {
    return { ok: false, error: "PLAYER_NOT_ELIGIBLE" };
  }

  const targetTable = findTableByNumber(db, targetTableNumber);
  if (!targetTable) {
    return { ok: false, error: "TABLE_NOT_FOUND" };
  }

  if (targetSeatIndex < 0 || targetSeatIndex >= targetTable.seats.length) {
    return { ok: false, error: "INVALID_SEAT" };
  }

  if (targetTable.seats[targetSeatIndex]) {
    return { ok: false, error: "SEAT_OCCUPIED", message: "Selected seat is not empty." };
  }

  const playerName = `${player.firstName} ${player.lastName}`.trim();

  db.tables = db.tables.map((table) => ({
    ...table,
    seats: table.seats.map((seatId) => (seatId === playerId ? null : seatId)),
  }));

  db.tables = db.tables.map((table) =>
    table.id === targetTable.id
      ? {
          ...table,
          seats: table.seats.map((seatId, index) =>
            index === targetSeatIndex ? playerId : seatId,
          ),
        }
      : table,
  );

  db.players = db.players.map((entry) =>
    entry.id === playerId
      ? {
          ...entry,
          tableId: targetTable.id,
          seatIndex: targetSeatIndex,
          status: "Playing" as Player["status"],
        }
      : entry,
  );

  reconcileTableSeats(db);
  addHistoryEvent(
    db,
    "move",
    `Moved ${playerName} to Table ${targetTable.number}, Seat ${targetSeatIndex + 1}`,
    playerId,
    playerName,
  );
  bumpDatabaseMeta(db);
  return { ok: true };
}
