import type { RepositoryFactoryOptions, TournamentRepository } from "./TournamentRepository";
import { JsonFileRepository } from "./JsonFileRepository";
import { PostgresRepository } from "./postgres/PostgresRepository";
import { resolveDatabaseUrl } from "./databaseConfig";

/**
 * Creates the active persistence backend.
 * Default: JsonFileRepository (db.json). Set USE_POSTGRES=true to try PostgreSQL.
 * Falls back to JSON when PG is unavailable or misconfigured.
 */
export async function createRepositoryAsync(
  options: RepositoryFactoryOptions = {},
): Promise<TournamentRepository> {
  if (process.env.USE_POSTGRES !== "true") {
    return new JsonFileRepository(options);
  }

  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    console.warn(
      "[repository] USE_POSTGRES=true but DATABASE_URL / database.json is missing. Using JsonFileRepository.",
    );
    return new JsonFileRepository(options);
  }

  try {
    const repo = await PostgresRepository.create(databaseUrl, options);
    console.log("[repository] Using PostgresRepository");
    return repo;
  } catch (error) {
    console.warn(
      "[repository] PostgreSQL connection failed — falling back to JsonFileRepository.",
      error,
    );
    return new JsonFileRepository(options);
  }
}

/** @deprecated Use createRepositoryAsync — kept for tests importing sync factory name. */
export function createRepository(options: RepositoryFactoryOptions = {}): TournamentRepository {
  if (process.env.USE_POSTGRES === "true") {
    console.warn(
      "[repository] createRepository() called while USE_POSTGRES=true. Use createRepositoryAsync() at startup.",
    );
  }
  return new JsonFileRepository(options);
}
