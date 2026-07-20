import type { TournamentDatabase } from "../server/tournamentDatabase";
import type { DealerRotationData } from "../server/dealerRotation/types";
import type { ClockState, HistoryEvent, PayoutStructure, Player, Table, TournamentSettings } from "../types";
import type { FloorCall } from "../types";

export const TOURNAMENT_BACKUP_VERSION = 1;

export type TournamentBackupPayload = {
  backupVersion: number;
  exportedAt: string;
  settings: TournamentSettings;
  clock: ClockState;
  players: Player[];
  tables: Table[];
  history: HistoryEvent[];
  payouts: PayoutStructure[];
  floorCalls: FloorCall[];
  dealerRotation: DealerRotationData;
};

export function buildTournamentBackupExport(db: TournamentDatabase): TournamentBackupPayload {
  return {
    backupVersion: TOURNAMENT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: db.settings,
    clock: db.clock,
    players: db.players,
    tables: db.tables,
    history: db.history ?? [],
    payouts: db.payouts ?? [],
    floorCalls: db.floorCalls ?? [],
    dealerRotation: db.dealerRotation,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseTournamentBackup(raw: unknown): { ok: true; data: Omit<TournamentDatabase, "meta"> } | { ok: false; error: string } {
  if (!isRecord(raw)) {
    return { ok: false as const, error: "Invalid backup file format." };
  }

  const source = isRecord(raw.settings) && Array.isArray(raw.players)
    ? raw
    : isRecord(raw.data) ? raw.data : null;

  if (!source || !isRecord(source.settings)) {
    return { ok: false as const, error: "Backup must include tournament settings." };
  }

  if (!Array.isArray(source.players)) {
    return { ok: false as const, error: "Backup must include a players array." };
  }

  if (!Array.isArray(source.tables)) {
    return { ok: false as const, error: "Backup must include a tables array." };
  }

  if (!isRecord(source.clock)) {
    return { ok: false as const, error: "Backup must include clock state." };
  }

  if (!Array.isArray(source.settings.blindStructure)) {
    return { ok: false as const, error: "Backup must include blind structure in settings." };
  }

  return {
    ok: true as const,
    data: {
      settings: source.settings as unknown as TournamentSettings,
      clock: source.clock as unknown as ClockState,
      players: source.players as Player[],
      tables: source.tables as Table[],
      history: Array.isArray(source.history) ? source.history as HistoryEvent[] : [],
      payouts: Array.isArray(source.payouts) ? source.payouts as PayoutStructure[] : [],
      floorCalls: Array.isArray(source.floorCalls) ? source.floorCalls as FloorCall[] : [],
      dealerRotation: (source.dealerRotation ?? {}) as DealerRotationData,
    },
  };
}

export function sanitizeBackupFilenamePart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").slice(0, 48) || "tournament";
}

export function downloadTournamentBackupJson(backup: TournamentBackupPayload): void {
  const tournamentLabel = sanitizeBackupFilenamePart(backup.settings.name || backup.settings.id || "tournament");
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `tournament_backup_${datePart}_${tournamentLabel}.json`;
  const dataStr = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup, null, 2))}`;
  const anchor = document.createElement("a");
  anchor.setAttribute("href", dataStr);
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
