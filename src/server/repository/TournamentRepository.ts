import type { TournamentDatabase } from "../tournamentDatabase";

/** Persistence backend for the full tournament snapshot. Phase 2 adds PostgresRepository. */
export interface TournamentRepository {
  /** Current in-memory snapshot (same reference semantics as legacy `getDb`). */
  get(): TournamentDatabase;

  /** Full save with meta bump and activity log append. */
  save(next: TournamentDatabase): TournamentDatabase;

  /** Clock-only disk write without meta bump (director sync). */
  saveClockOnly(next: TournamentDatabase): void;

  /** Delete persisted file and reload defaults / existing seed. */
  reset(): TournamentDatabase;

  /** Register history ids already written to activity log (startup). */
  registerExistingHistory(history: TournamentDatabase["history"]): void;

  /** Plain-text activity log for API export. */
  getActivityLogContent(): string;

  readonly backend: "json" | "postgres";
}

export type RepositoryFactoryOptions = {
  dbFilePath?: string;
  logsDirPath?: string;
};
