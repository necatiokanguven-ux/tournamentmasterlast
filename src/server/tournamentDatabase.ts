import type { ClockState, DealerTimerModeSetting, DealerZone, FloorCall, FloorTeam, HistoryEvent, PayoutStructure, Player, Table, TournamentSettings } from "../types";
import { MAX_TABLE_SEATS } from "../types";
import { normalizeDealerRotation, type DealerRotationData } from "./dealerRotation/types";
import { repairDealerTimingFields } from "../dealerRotation/dealerTimeUtils";

export interface TournamentDatabase {
  settings: TournamentSettings;
  clock: ClockState;
  players: Player[];
  tables: Table[];
  history: HistoryEvent[];
  payouts: PayoutStructure[];
  floorCalls: FloorCall[];
  dealerRotation: DealerRotationData;
  meta: {
    lastModified: number;
    /** Phase 6.4 — optimistic lock per dealer zone when DEALER_ZONES=true */
    zoneVersions?: Record<string, number>;
  };
}

export const DEFAULT_DEALER_CALL_TIME = 30;
export const DEFAULT_DEALER_PLAYER_TIME = 60;
export const DEFAULT_DEALER_TIMER_MODE: DealerTimerModeSetting = "call_time";

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
    dealerTimerMode: base.dealerTimerMode ?? DEFAULT_DEALER_TIMER_MODE,
    floorTeams: Array.isArray(base.floorTeams) ? base.floorTeams : [],
    dealerZones: Array.isArray(base.dealerZones) ? base.dealerZones : [],
  };
}

export function normalizeDatabase(raw: Partial<TournamentDatabase>): TournamentDatabase {
  const rawClock = raw.clock ?? {
    currentLevelIndex: 0,
    timeRemaining: 1200,
    isRunning: false,
    elapsedTime: 0,
    soundEnabled: true,
    fullscreen: false,
    syncedAtMs: null,
    tournamentStartedAt: null,
  };

  let tournamentStartedAt = rawClock.tournamentStartedAt ?? null;
  if (!tournamentStartedAt && (rawClock.elapsedTime ?? 0) > 0) {
    tournamentStartedAt = new Date(Date.now() - (rawClock.elapsedTime ?? 0) * 1000).toISOString();
  }

  const normalized: TournamentDatabase = {
    settings: normalizeSettings(raw.settings),
    clock: {
      ...rawClock,
      syncedAtMs: rawClock.syncedAtMs ?? null,
      tournamentStartedAt,
    },
    players: Array.isArray(raw.players) ? raw.players : [],
    tables: Array.isArray(raw.tables)
      ? raw.tables.map((table) => {
          const seats = Array.isArray(table.seats) ? [...table.seats] : [];
          const normalizedSeats = seats.slice(0, MAX_TABLE_SEATS);
          while (normalizedSeats.length < MAX_TABLE_SEATS) {
            normalizedSeats.push(null);
          }
          return { ...table, seats: normalizedSeats };
        })
      : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    payouts: Array.isArray(raw.payouts) ? raw.payouts : [],
    floorCalls: Array.isArray(raw.floorCalls) ? raw.floorCalls : [],
    dealerRotation: normalizeDealerRotation(raw.dealerRotation),
    meta: {
      lastModified: raw.meta?.lastModified ?? Date.now(),
      zoneVersions: raw.meta?.zoneVersions ? { ...raw.meta.zoneVersions } : {},
    },
  };

  repairDealerTimingFields(
    normalized.dealerRotation.staff,
    normalized.dealerRotation.settings,
  );

  return normalized;
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

export function validateDealerZones(zones: DealerZone[], activeTableNumbers: number[]): string | null {
  const assigned = new Map<number, string>();
  const active = new Set(activeTableNumbers);

  for (const zone of zones) {
    if (!zone.id || !zone.name) {
      return "Each dealer zone needs an id and name.";
    }

    for (const tableNumber of zone.tableNumbers) {
      if (!active.has(tableNumber)) {
        return `Table ${tableNumber} is not an active tournament table.`;
      }
      if (assigned.has(tableNumber)) {
        return `Table ${tableNumber} is assigned to more than one dealer zone.`;
      }
      assigned.set(tableNumber, zone.id);
    }
  }

  return null;
}
