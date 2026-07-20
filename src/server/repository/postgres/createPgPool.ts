import { Pool } from "pg";
import { resolveDatabaseReadUrl, resolveDatabaseUrl } from "../databaseConfig";

export function createPgPool(connectionString?: string): Pool {
  const url = connectionString ?? resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }

  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

let readPool: Pool | null = null;

export function getOptionalReadPool(): Pool | null {
  const readUrl = resolveDatabaseReadUrl();
  if (!readUrl) {
    return null;
  }

  if (!readPool) {
    readPool = new Pool({
      connectionString: readUrl,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return readPool;
}

export async function verifyPgConnection(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}
