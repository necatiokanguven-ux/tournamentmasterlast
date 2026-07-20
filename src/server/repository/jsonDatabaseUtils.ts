import fs from "fs";
import path from "path";
import type { HistoryEvent, Player, Table } from "../../types";
import { bumpDatabaseMeta, normalizeDatabase, type TournamentDatabase } from "../tournamentDatabase";

export function isSeedWaitingPlayer(player: Player): boolean {
  return player.id.startsWith("player-wait-")
    || (player.firstName === "Waiting" && /^Player \d+$/.test(player.lastName));
}

export function sanitizeDatabase(raw: Partial<TournamentDatabase>): Partial<TournamentDatabase> {
  if (!Array.isArray(raw.players)) return raw;

  const players = raw.players.filter(player => !isSeedWaitingPlayer(player));
  const playerIds = new Set(players.map(player => player.id));
  const tables = Array.isArray(raw.tables)
    ? raw.tables.map(table => ({
        ...table,
        seats: table.seats.map(seatId => (seatId && playerIds.has(seatId) ? seatId : null)),
      }))
    : raw.tables;

  return { ...raw, players, tables };
}

export function formatActivityLogLine(event: HistoryEvent): string {
  const timestamp = new Date(event.timestamp).toLocaleString();
  const player = event.playerName ? ` [${event.playerName}]` : "";
  return `[${timestamp}] ${event.type.toUpperCase()}${player}: ${event.description}`;
}

export function getActivityLogPath(logsDir: string, tournamentId: string): string {
  const safeId = (tournamentId || "tournament").replace(/[^\w\-]+/g, "_");
  return path.join(logsDir, `${safeId}-activity.log`);
}

export function ensureLogsDir(logsDir: string): void {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

export function writeDatabaseFile(dbFilePath: string, data: TournamentDatabase): void {
  const tempPath = `${dbFilePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, dbFilePath);
}

export function persistJsonSnapshot(
  dbFilePath: string,
  logsDir: string,
  loggedEventIds: Set<string>,
  data: Partial<TournamentDatabase>,
  options?: { bumpMeta?: boolean; appendActivityLog?: boolean },
): TournamentDatabase {
  const normalized = normalizeDatabase(data);
  if (options?.bumpMeta !== false) {
    bumpDatabaseMeta(normalized);
  }

  writeDatabaseFile(dbFilePath, normalized);

  if (options?.appendActivityLog !== false) {
    appendActivityLog(logsDir, loggedEventIds, normalized.history || [], normalized.settings?.id || "tournament");
  }

  return normalized;
}

export function appendActivityLog(
  logsDir: string,
  loggedEventIds: Set<string>,
  history: HistoryEvent[] = [],
  tournamentId: string,
): void {
  const newEvents = history.filter(event => !loggedEventIds.has(event.id));
  if (newEvents.length === 0) return;

  ensureLogsDir(logsDir);
  const logPath = getActivityLogPath(logsDir, tournamentId);
  const chronological = [...newEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const lines = chronological.map(event => formatActivityLogLine(event)).join("\n") + "\n";
  fs.appendFileSync(logPath, lines, "utf-8");

  for (const event of newEvents) {
    loggedEventIds.add(event.id);
  }
}

export function formatHistoryFallbackLog(history: HistoryEvent[]): string {
  return [...history]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(event => formatActivityLogLine(event))
    .join("\n");
}
