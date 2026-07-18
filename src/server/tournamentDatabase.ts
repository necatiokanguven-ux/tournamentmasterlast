import type { ClockState, FloorCall, FloorTeam, HistoryEvent, PayoutStructure, Player, Table, TournamentSettings } from "../types";

export interface TournamentDatabase {
  settings: TournamentSettings;
  clock: ClockState;
  players: Player[];
  tables: Table[];
  history: HistoryEvent[];
  payouts: PayoutStructure[];
  floorCalls: FloorCall[];
  meta: {
    lastModified: number;
  };
}

export const DEFAULT_DEALER_CALL_TIME = 30;
export const DEFAULT_DEALER_PLAYER_TIME = 60;

export function normalizeSettings(settings: Partial<TournamentSettings> | undefined): TournamentSettings {
  const base = settings ?? ({} as TournamentSettings);
  return {
    ...base,
    id: base.id ?? "tournament",
    name: base.name ?? "Tournament",
    buyIn: base.buyIn ?? 0,
    fee: base.fee ?? 0,
    startingStack: base.startingStack ?? 30000,
    bonusChips: base.bonusChips ?? 0,
    addonChips: base.addonChips ?? 0,
    rebuyChips: base.rebuyChips ?? 0,
    maxPlayers: base.maxPlayers ?? 150,
    maxTables: base.maxTables ?? 15,
    blindTime: base.blindTime ?? 20,
    breakTime: base.breakTime ?? 15,
    breakFrequency: base.breakFrequency ?? 6,
    type: base.type ?? "Re-entry",
    blindStructure: Array.isArray(base.blindStructure) ? base.blindStructure : [],
    lateRegLevel: base.lateRegLevel ?? 7,
    dealerCallTimeSeconds: base.dealerCallTimeSeconds ?? DEFAULT_DEALER_CALL_TIME,
    dealerPlayerTimeSeconds: base.dealerPlayerTimeSeconds ?? DEFAULT_DEALER_PLAYER_TIME,
    floorTeams: Array.isArray(base.floorTeams) ? base.floorTeams : [],
  };
}

export function normalizeDatabase(raw: Partial<TournamentDatabase>): TournamentDatabase {
  return {
    settings: normalizeSettings(raw.settings),
    clock: raw.clock ?? {
      currentLevelIndex: 0,
      timeRemaining: 1200,
      isRunning: false,
      elapsedTime: 0,
      soundEnabled: true,
      fullscreen: false,
    },
    players: Array.isArray(raw.players) ? raw.players : [],
    tables: Array.isArray(raw.tables) ? raw.tables : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    payouts: Array.isArray(raw.payouts) ? raw.payouts : [],
    floorCalls: Array.isArray(raw.floorCalls) ? raw.floorCalls : [],
    meta: {
      lastModified: raw.meta?.lastModified ?? Date.now(),
    },
  };
}

export function bumpDatabaseMeta(db: TournamentDatabase): void {
  db.meta.lastModified = Date.now();
}

export function findTableByNumber(db: TournamentDatabase, tableNumber: number): Table | undefined {
  return db.tables.find((table) => table.number === tableNumber);
}

export function findFloorTeamForTable(db: TournamentDatabase, tableNumber: number): FloorTeam | undefined {
  const teams = db.settings.floorTeams ?? [];
  return teams.find((team) => team.tableNumbers.includes(tableNumber));
}

export function validateFloorTeams(teams: FloorTeam[], _activeTableNumbers: number[]): string | null {
  const assigned = new Map<number, string>();

  for (const team of teams) {
    if (!team.id || !team.name) {
      return "Each floor team needs an id and name.";
    }

    for (const tableNumber of team.tableNumbers) {
      if (assigned.has(tableNumber)) {
        return `Table ${tableNumber} is assigned to more than one floor team.`;
      }
      assigned.set(tableNumber, team.id);
    }
  }

  return null;
}
