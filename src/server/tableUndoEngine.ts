import type { Player, Table } from "../types";

export type TableUndoSnapshot = {
  players: Player[];
  tables: Table[];
  payouts: unknown[];
  history: unknown[];
};

export type TableUndoSlice = {
  players: Player[];
  tables: Table[];
  payouts: unknown[];
};

function cloneSlice(snapshot: TableUndoSlice): TableUndoSlice {
  return {
    players: snapshot.players.map(player => ({ ...player })),
    tables: snapshot.tables.map(table => ({ ...table, seats: [...table.seats] })),
    payouts: [...snapshot.payouts],
  };
}

function findAffectedPlayerIds(before: TableUndoSnapshot, after: TableUndoSnapshot): string[] {
  const ids = new Set<string>();

  for (const afterPlayer of after.players) {
    const beforePlayer = before.players.find(player => player.id === afterPlayer.id);
    if (!beforePlayer) continue;

    if (
      beforePlayer.tableId !== afterPlayer.tableId
      || beforePlayer.seatIndex !== afterPlayer.seatIndex
      || beforePlayer.status !== afterPlayer.status
    ) {
      ids.add(afterPlayer.id);
    }
  }

  for (const beforePlayer of before.players) {
    if (!after.players.some(player => player.id === beforePlayer.id)) {
      ids.add(beforePlayer.id);
    }
  }

  return [...ids];
}

function findRemovedTableIds(before: TableUndoSnapshot, after: TableUndoSnapshot): string[] {
  return before.tables
    .filter(table => !after.tables.some(entry => entry.id === table.id))
    .map(table => table.id);
}

function findAddedTableIds(before: TableUndoSnapshot, after: TableUndoSnapshot): string[] {
  return after.tables
    .filter(table => !before.tables.some(entry => entry.id === table.id))
    .map(table => table.id);
}

function findDeletedPlayerIds(before: TableUndoSnapshot, after: TableUndoSnapshot): string[] {
  return before.players
    .filter(player => !after.players.some(entry => entry.id === player.id))
    .map(player => player.id);
}

function findAddedPlayerIds(before: TableUndoSnapshot, after: TableUndoSnapshot): string[] {
  return after.players
    .filter(player => !before.players.some(entry => entry.id === player.id))
    .map(player => player.id);
}

function findAffectedTableIds(before: TableUndoSnapshot, after: TableUndoSnapshot): string[] {
  const ids = new Set<string>();

  for (const beforeTable of before.tables) {
    const afterTable = after.tables.find(table => table.id === beforeTable.id);
    if (!afterTable) {
      ids.add(beforeTable.id);
      continue;
    }

    if (
      beforeTable.dealerSeatIndex !== afterTable.dealerSeatIndex
      || beforeTable.seats.some((seatId, index) => seatId !== afterTable.seats[index])
    ) {
      ids.add(beforeTable.id);
    }
  }

  for (const afterTable of after.tables) {
    if (!before.tables.some(table => table.id === afterTable.id)) {
      ids.add(afterTable.id);
    }
  }

  return [...ids];
}

function clearPlayerFromSeats(state: TableUndoSlice, playerId: string) {
  state.tables = state.tables.map(table => ({
    ...table,
    seats: table.seats.map(seatId => (seatId === playerId ? null : seatId)),
  }));
}

function validateTableUndoSlice(state: TableUndoSlice): { ok: true } | { ok: false; error: string } {
  const tableIds = new Set(state.tables.map(table => table.id));
  const seatedPlayerIds = new Set<string>();

  for (const table of state.tables) {
    for (let seatIndex = 0; seatIndex < table.seats.length; seatIndex++) {
      const playerId = table.seats[seatIndex];
      if (!playerId) continue;

      const player = state.players.find(entry => entry.id === playerId);
      if (!player) {
        return {
          ok: false,
          error: `Undo blocked: seat ${seatIndex + 1} on Table ${table.number} references a missing player.`,
        };
      }

      if (seatedPlayerIds.has(playerId)) {
        return {
          ok: false,
          error: `Undo blocked: ${player.firstName} ${player.lastName} appears in multiple seats.`,
        };
      }
      seatedPlayerIds.add(playerId);

      if (player.tableId !== table.id || player.seatIndex !== seatIndex) {
        return {
          ok: false,
          error: `Undo blocked: ${player.firstName} ${player.lastName} has inconsistent seating on Table ${table.number}.`,
        };
      }
    }
  }

  for (const player of state.players) {
    if (player.status === "Eliminated") continue;
    if (!player.tableId || player.seatIndex === null) continue;

    if (!tableIds.has(player.tableId)) {
      return {
        ok: false,
        error: `Undo blocked: ${player.firstName} ${player.lastName} is assigned to a table that no longer exists. Undo the table closure first, or include it in this undo.`,
      };
    }

    const table = state.tables.find(entry => entry.id === player.tableId);
    if (!table || table.seats[player.seatIndex] !== player.id) {
      return {
        ok: false,
        error: `Undo blocked: ${player.firstName} ${player.lastName} cannot be restored safely because the target seat changed. Undo later seat changes first or include them in this undo.`,
      };
    }
  }

  return { ok: true };
}

export function revertTableUndoEntry(
  entry: { before: TableUndoSnapshot; after: TableUndoSnapshot; description: string },
  inputState: TableUndoSlice,
): { ok: true; state: TableUndoSlice } | { ok: false; error: string } {
  const state = cloneSlice(inputState);
  const { before, after } = entry;

  const affectedPlayerIds = findAffectedPlayerIds(before, after);
  const removedTableIds = findRemovedTableIds(before, after);
  const addedTableIds = findAddedTableIds(before, after);
  const deletedPlayerIds = findDeletedPlayerIds(before, after);
  const addedPlayerIds = findAddedPlayerIds(before, after);
  const affectedTableIds = findAffectedTableIds(before, after);

  for (const tableId of addedTableIds) {
    const table = state.tables.find(entryTable => entryTable.id === tableId);
    if (!table) continue;

    for (const seatId of table.seats) {
      if (!seatId) continue;
      const player = state.players.find(entryPlayer => entryPlayer.id === seatId);
      if (player) {
        player.tableId = null;
        player.seatIndex = null;
        if (player.status === "Playing") {
          player.status = "Waiting";
        }
      }
    }

    state.tables = state.tables.filter(entryTable => entryTable.id !== tableId);
  }

  for (const playerId of addedPlayerIds) {
    state.players = state.players.filter(player => player.id !== playerId);
  }

  for (const playerId of deletedPlayerIds) {
    const player = before.players.find(entry => entry.id === playerId);
    if (!player) continue;
    if (!state.players.some(entry => entry.id === playerId)) {
      state.players.push({ ...player });
    }
  }

  for (const tableId of removedTableIds) {
    const tableBefore = before.tables.find(table => table.id === tableId);
    if (!tableBefore) continue;

    if (!state.tables.some(table => table.id === tableId)) {
      state.tables.push({
        ...tableBefore,
        seats: [...tableBefore.seats],
      });
    }
  }

  for (const playerId of affectedPlayerIds) {
    clearPlayerFromSeats(state, playerId);

    const playerBefore = before.players.find(player => player.id === playerId);
    if (!playerBefore) continue;

    if (playerBefore.tableId && playerBefore.seatIndex !== null) {
      const tableBefore = before.tables.find(table => table.id === playerBefore.tableId);
      if (!tableBefore) {
        return {
          ok: false,
          error: `Cannot undo "${entry.description}" because the original table record is missing.`,
        };
      }

      if (!state.tables.some(table => table.id === tableBefore.id)) {
        state.tables.push({
          ...tableBefore,
          seats: [...tableBefore.seats],
        });
      }

      const table = state.tables.find(entryTable => entryTable.id === tableBefore.id)!;
      const occupiedBy = table.seats[playerBefore.seatIndex];
      if (occupiedBy && occupiedBy !== playerId) {
        const occupant = state.players.find(player => player.id === occupiedBy);
        const occupantName = occupant
          ? `${occupant.firstName} ${occupant.lastName}`
          : "another player";
        return {
          ok: false,
          error: `Cannot undo "${entry.description}" because seat ${playerBefore.seatIndex + 1} on Table ${tableBefore.number} is occupied by ${occupantName}. Undo or move that player first.`,
        };
      }
    }

    state.players = state.players.map(player =>
      player.id === playerId ? { ...playerBefore } : player,
    );
  }

  for (const tableId of affectedTableIds) {
    const tableBefore = before.tables.find(table => table.id === tableId);
    if (!tableBefore) continue;

    if (!state.tables.some(table => table.id === tableId)) {
      state.tables.push({
        ...tableBefore,
        seats: [...tableBefore.seats],
      });
      continue;
    }

    for (let seatIndex = 0; seatIndex < tableBefore.seats.length; seatIndex++) {
      const targetPlayerId = tableBefore.seats[seatIndex];
      if (!targetPlayerId) continue;

      const table = state.tables.find(entryTable => entryTable.id === tableId)!;
      const occupiedBy = table.seats[seatIndex];
      if (occupiedBy && occupiedBy !== targetPlayerId) {
        const occupant = state.players.find(player => player.id === occupiedBy);
        const occupantName = occupant
          ? `${occupant.firstName} ${occupant.lastName}`
          : "another player";
        return {
          ok: false,
          error: `Cannot undo "${entry.description}" because seat ${seatIndex + 1} on Table ${tableBefore.number} is occupied by ${occupantName}.`,
        };
      }
    }

    state.tables = state.tables.map(table =>
      table.id === tableId
        ? {
            ...table,
            number: tableBefore.number,
            dealerSeatIndex: tableBefore.dealerSeatIndex,
            seats: [...tableBefore.seats],
          }
        : table,
    );
  }

  for (const player of state.players) {
    if (player.status === "Eliminated" || !player.tableId || player.seatIndex === null) {
      continue;
    }

    const table = state.tables.find(entry => entry.id === player.tableId);
    if (!table) {
      return {
        ok: false,
        error: `Cannot undo "${entry.description}" because ${player.firstName} ${player.lastName} would be left without a valid table.`,
      };
    }

    if (table.seats[player.seatIndex] !== player.id) {
      table.seats[player.seatIndex] = player.id;
    }
  }

  const validation = validateTableUndoSlice(state);
  if (validation.ok === false) {
    return { ok: false, error: validation.error };
  }

  return { ok: true, state };
}

export function simulateTableUndoActions(
  entries: Array<{ id: string; before: TableUndoSnapshot; after: TableUndoSnapshot; description: string }>,
  selectedIds: string[],
  currentState: TableUndoSlice,
): { ok: true; state: TableUndoSlice } | { ok: false; error: string } {
  if (selectedIds.length === 0) {
    return { ok: false, error: "Select at least one action to undo." };
  }

  const selected = new Set(selectedIds);
  const selectedEntries = entries.filter(entry => selected.has(entry.id));

  if (selectedEntries.length !== selectedIds.length) {
    return { ok: false, error: "One or more selected undo entries are no longer available." };
  }

  let state = cloneSlice(currentState);

  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (!selected.has(entry.id)) continue;

    const result = revertTableUndoEntry(entry, state);
    if (!result.ok) {
      return result;
    }
    state = result.state;
  }

  const validation = validateTableUndoSlice(state);
  if (validation.ok === false) {
    return { ok: false, error: validation.error };
  }

  return { ok: true, state };
}
