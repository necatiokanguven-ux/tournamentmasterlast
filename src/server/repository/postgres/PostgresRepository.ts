import path from "path";
import type { Pool } from "pg";
import { bumpDatabaseMeta, normalizeDatabase, type TournamentDatabase } from "../../tournamentDatabase";
import { buildDefaultSeedDatabase } from "../defaultSeedDatabase";
import {
  appendActivityLog,
  formatHistoryFallbackLog,
  sanitizeDatabase,
} from "../jsonDatabaseUtils";
import type { RepositoryFactoryOptions, TournamentRepository } from "../TournamentRepository";
import { createPgPool, verifyPgConnection } from "./createPgPool";
import { runMigrations } from "./runMigrations";
import { syncDealerStaffShadow, countDealersInGraceFromShadow } from "./syncDealerStaffShadow";

type DocumentRow = {
  payload: TournamentDatabase;
};

export class PostgresRepository implements TournamentRepository {
  readonly backend = "postgres" as const;

  private db: TournamentDatabase;
  private readonly pool: Pool;
  private readonly logsDir: string;
  private readonly loggedEventIds = new Set<string>();
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(pool: Pool, db: TournamentDatabase, logsDir: string) {
    this.pool = pool;
    this.db = db;
    this.logsDir = logsDir;
  }

  static async create(
    connectionString: string | undefined,
    options: RepositoryFactoryOptions = {},
  ): Promise<PostgresRepository> {
    const pool = createPgPool(connectionString);
    await verifyPgConnection(pool);
    await runMigrations(pool);

    const logsDir = options.logsDirPath ?? path.join(process.cwd(), "logs");
    const repo = new PostgresRepository(
      pool,
      normalizeDatabase(buildDefaultSeedDatabase()),
      logsDir,
    );
    repo.db = await repo.loadInitial();
    return repo;
  }

  get(): TournamentDatabase {
    return this.db;
  }

  save(next: TournamentDatabase): TournamentDatabase {
    try {
      const normalized = normalizeDatabase(next);
      bumpDatabaseMeta(normalized);
      this.db = normalized;
      appendActivityLog(
        this.logsDir,
        this.loggedEventIds,
        normalized.history || [],
        normalized.settings?.id || "tournament",
      );
      this.enqueueWrite(normalized, { bumpMeta: false });
      return this.db;
    } catch (error) {
      console.error("[postgres] Error saving tournament document", error);
      return this.db;
    }
  }

  saveClockOnly(next: TournamentDatabase): void {
    try {
      this.db = normalizeDatabase(next);
      this.enqueueWrite(this.db, { bumpMeta: false });
    } catch (error) {
      console.error("[postgres] Error saving clock sync", error);
    }
  }

  reset(): TournamentDatabase {
    try {
      const seed = normalizeDatabase(buildDefaultSeedDatabase());
      bumpDatabaseMeta(seed);
      this.db = seed;
      this.loggedEventIds.clear();
      this.enqueueWrite(seed, { bumpMeta: false });
      return this.db;
    } catch (error) {
      console.error("[postgres] Error resetting database", error);
      return this.db;
    }
  }

  registerExistingHistory(history: TournamentDatabase["history"] = []): void {
    for (const event of history) {
      this.loggedEventIds.add(event.id);
    }
  }

  getActivityLogContent(): string {
    return formatHistoryFallbackLog(this.db.history || []);
  }

  async flushPendingWrites(): Promise<void> {
    await this.writeChain;
  }

  async close(): Promise<void> {
    await this.flushPendingWrites();
    await this.pool.end();
  }

  async countDealersInGrace(): Promise<number> {
    return countDealersInGraceFromShadow(this.pool);
  }

  private enqueueWrite(data: TournamentDatabase, options?: { bumpMeta?: boolean }): void {
    const snapshot = normalizeDatabase(data);
    this.writeChain = this.writeChain
      .then(() => this.writeDocument(snapshot, options))
      .catch(error => {
        console.error("[postgres] Persist failed", error);
      });
  }

  private async loadInitial(): Promise<TournamentDatabase> {
    const row = await this.pool.query<DocumentRow>(
      "SELECT payload FROM tournament_document WHERE id = 1",
    );

    if (row.rowCount && row.rows[0]) {
      const raw = row.rows[0].payload as Partial<TournamentDatabase>;
      const sanitized = sanitizeDatabase(raw);
      const normalized = normalizeDatabase(sanitized);

      if (
        Array.isArray(raw.players)
        && Array.isArray(sanitized.players)
        && sanitized.players.length !== raw.players.length
      ) {
        await this.writeDocument(normalized, { bumpMeta: false });
        return normalized;
      }

      return normalized;
    }

    const seed = normalizeDatabase(buildDefaultSeedDatabase());
    bumpDatabaseMeta(seed);
    await this.writeDocument(seed, { bumpMeta: false });
    return seed;
  }

  private async writeDocument(
    data: TournamentDatabase,
    options?: { bumpMeta?: boolean },
  ): Promise<void> {
    const normalized = normalizeDatabase(data);
    if (options?.bumpMeta !== false) {
      bumpDatabaseMeta(normalized);
    }

    await this.pool.query(
      `
        INSERT INTO tournament_document (id, payload, last_modified, version)
        VALUES (1, $1::jsonb, $2, 0)
        ON CONFLICT (id) DO UPDATE
        SET payload = EXCLUDED.payload,
            last_modified = EXCLUDED.last_modified,
            version = tournament_document.version + 1
      `,
      [JSON.stringify(normalized), normalized.meta.lastModified],
    );

    await syncDealerStaffShadow(this.pool, normalized).catch(error => {
      console.error("[postgres] dealer_staff shadow sync failed", error);
    });

    this.db = normalized;
  }
}
