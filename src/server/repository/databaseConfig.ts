import crypto from "node:crypto";
import fs from "fs";
import os from "os";
import path from "path";

export type DatabaseConfigFile = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

const DEFAULT_PG_PORT = 5433;

/** Where installer / launcher writes auto-generated PG credentials (Phase 2.8). */
export function resolveDatabaseConfigPath(): string {
  if (process.env.TM_DATABASE_CONFIG) {
    return process.env.TM_DATABASE_CONFIG;
  }

  if (process.platform === "win32") {
    const programData = process.env.ProgramData || path.join("C:", "ProgramData");
    return path.join(programData, "TournamentMaster", "config", "database.json");
  }

  return path.join(process.cwd(), "data", "config", "database.json");
}

export function loadDatabaseConfigFile(): DatabaseConfigFile | null {
  const configPath = resolveDatabaseConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<DatabaseConfigFile>;
    if (!raw.host || !raw.database || !raw.user || !raw.password) {
      return null;
    }

    return {
      host: raw.host,
      port: Number(raw.port) || DEFAULT_PG_PORT,
      database: raw.database,
      user: raw.user,
      password: raw.password,
      ssl: Boolean(raw.ssl),
    };
  } catch {
    return null;
  }
}

export function buildDatabaseUrl(config: DatabaseConfigFile): string {
  const encodedUser = encodeURIComponent(config.user);
  const encodedPassword = encodeURIComponent(config.password);
  const sslMode = config.ssl ? "?sslmode=require" : "";
  return `postgresql://${encodedUser}:${encodedPassword}@${config.host}:${config.port}/${config.database}${sslMode}`;
}

export function resolveDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const fileConfig = loadDatabaseConfigFile();
  if (!fileConfig) {
    return null;
  }

  return buildDatabaseUrl(fileConfig);
}

/** Phase 8.2 — optional read replica URL (reporting only; writes always use primary). */
export function resolveDatabaseReadUrl(): string | null {
  if (process.env.DATABASE_READ_URL?.trim()) {
    return process.env.DATABASE_READ_URL.trim();
  }
  return null;
}

/** Phase 2.8 — write credentials after embedded PG init (installer only). */
export function saveDatabaseConfigFile(config: DatabaseConfigFile): void {
  const configPath = resolveDatabaseConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  if (process.platform !== "win32") {
    try {
      fs.chmodSync(path.dirname(configPath), 0o700);
      fs.chmodSync(configPath, 0o600);
    } catch {
      // Best-effort permissions on non-Windows.
    }
  }
}

export function generateRandomPassword(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

export function defaultEmbeddedDatabaseConfig(password: string): DatabaseConfigFile {
  return {
    host: "127.0.0.1",
    port: DEFAULT_PG_PORT,
    database: "tournament_master",
    user: "tournament_app",
    password,
    ssl: false,
  };
}

export function getDefaultDataDirectory(): string {
  if (process.env.TM_DATA_DIR?.trim()) {
    return process.env.TM_DATA_DIR.trim();
  }

  if (process.platform === "win32") {
    const programData = process.env.ProgramData || path.join("C:", "ProgramData");
    return path.join(programData, "TournamentMaster", "data");
  }
  return path.join(process.cwd(), "data");
}

export function getEmbeddedPgDataDirectory(): string {
  return path.join(getDefaultDataDirectory(), "pgdata");
}

export function getMachineLabel(): string {
  return process.env.COMPUTERNAME || process.env.HOSTNAME || os.hostname() || "venue-pc";
}
