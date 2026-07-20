import fs from "fs";
import path from "path";
import { normalizeDatabase, type TournamentDatabase } from "../tournamentDatabase";
import { buildDefaultSeedDatabase } from "./defaultSeedDatabase";
import {
  formatHistoryFallbackLog,
  getActivityLogPath,
  persistJsonSnapshot,
  sanitizeDatabase,
  writeDatabaseFile,
} from "./jsonDatabaseUtils";
import type { RepositoryFactoryOptions, TournamentRepository } from "./TournamentRepository";

export class JsonFileRepository implements TournamentRepository {
  readonly backend = "json" as const;

  private db: TournamentDatabase;
  private readonly dbFilePath: string;
  private readonly logsDir: string;
  private readonly loggedEventIds = new Set<string>();

  constructor(options: RepositoryFactoryOptions = {}) {
    this.dbFilePath = options.dbFilePath ?? path.join(process.cwd(), "db.json");
    this.logsDir = options.logsDirPath ?? path.join(process.cwd(), "logs");
    this.db = this.loadInitial();
  }

  get(): TournamentDatabase {
    return this.db;
  }

  save(next: TournamentDatabase): TournamentDatabase {
    try {
      this.db = persistJsonSnapshot(this.dbFilePath, this.logsDir, this.loggedEventIds, next);
      return this.db;
    } catch (error) {
      console.error("Error writing database file", error);
      return this.db;
    }
  }

  saveClockOnly(next: TournamentDatabase): void {
    try {
      this.db = normalizeDatabase(next);
      writeDatabaseFile(this.dbFilePath, this.db);
    } catch (error) {
      console.error("Error writing clock sync to database file", error);
    }
  }

  reset(): TournamentDatabase {
    if (fs.existsSync(this.dbFilePath)) {
      fs.unlinkSync(this.dbFilePath);
    }
    this.db = this.loadInitial();
    return this.db;
  }

  registerExistingHistory(history: TournamentDatabase["history"] = []): void {
    for (const event of history) {
      this.loggedEventIds.add(event.id);
    }
  }

  getActivityLogPathForTournament(tournamentId: string): string {
    return getActivityLogPath(this.logsDir, tournamentId);
  }

  readActivityLogText(tournamentId: string): string | null {
    const logPath = this.getActivityLogPathForTournament(tournamentId);
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, "utf-8");
    }
    return null;
  }

  formatHistoryFallback(): string {
    return formatHistoryFallbackLog(this.db.history || []);
  }

  getActivityLogContent(): string {
    const tournamentId = this.db.settings?.id || "tournament";
    const fromFile = this.readActivityLogText(tournamentId);
    return fromFile ?? this.formatHistoryFallback();
  }

  private loadInitial(): TournamentDatabase {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.dbFilePath, "utf-8")) as Partial<TournamentDatabase>;
        const sanitized = sanitizeDatabase(raw);
        if (Array.isArray(raw.players) && Array.isArray(sanitized.players) && sanitized.players.length !== raw.players.length) {
          return persistJsonSnapshot(this.dbFilePath, this.logsDir, this.loggedEventIds, sanitized);
        }
        return normalizeDatabase(sanitized);
      } catch (error) {
        console.error("Error reading database, using defaults", error);
      }
    }

    const seed = buildDefaultSeedDatabase();
    return persistJsonSnapshot(this.dbFilePath, this.logsDir, this.loggedEventIds, seed);
  }
}
