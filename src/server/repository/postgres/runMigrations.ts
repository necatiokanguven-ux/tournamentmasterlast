import fs from "fs";
import path from "path";
import type { Pool } from "pg";

function resolveMigrationsDirectory(): string {
  const candidates = [
    path.join(process.cwd(), "migrations"),
    path.join(process.cwd(), "..", "migrations"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(process.cwd(), "migrations");
}

function listMigrationFiles(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter(file => /^\d+_.+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationsDir = resolveMigrationsDirectory();
  const files = listMigrationFiles(migrationsDir);

  for (const file of files) {
    const version = Number.parseInt(file.split("_")[0] ?? "", 10);
    if (!Number.isFinite(version)) {
      continue;
    }

    const applied = await pool.query<{ version: number }>(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [version],
    );

    if (applied.rowCount && applied.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [version],
      );
      await client.query("COMMIT");
      console.log(`[postgres] Applied migration ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
