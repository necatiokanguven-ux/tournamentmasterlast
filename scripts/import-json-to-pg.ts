/**
 * One-time import: db.json → PostgreSQL tournament_document row.
 *
 * Usage:
 *   npm run import:json-to-pg -- db.json
 *
 * Reads DATABASE_URL from .env.local or .env in project root.
 */
import { loadProjectEnv } from "../src/server/loadEnv";

loadProjectEnv();

import fs from "fs";
import path from "path";
import { normalizeDatabase } from "../src/server/tournamentDatabase";
import { createPgPool, verifyPgConnection } from "../src/server/repository/postgres/createPgPool";
import { runMigrations } from "../src/server/repository/postgres/runMigrations";
import { syncDealerStaffShadow } from "../src/server/repository/postgres/syncDealerStaffShadow";

async function main(): Promise<void> {
  const dbFilePath = path.resolve(process.argv[2] ?? path.join(process.cwd(), "db.json"));

  if (!fs.existsSync(dbFilePath)) {
    console.error(`File not found: ${dbFilePath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(dbFilePath, "utf-8"));
  const normalized = normalizeDatabase(raw);

  const pool = createPgPool();
  await verifyPgConnection(pool);
  await runMigrations(pool);

  await pool.query(
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

  await syncDealerStaffShadow(pool, normalized);

  await pool.end();
  console.log(`Imported ${dbFilePath} into PostgreSQL tournament_document.`);
}

main().catch(error => {
  console.error("Import failed:", error);
  process.exit(1);
});
