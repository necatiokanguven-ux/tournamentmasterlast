import fs from "fs";
import path from "path";

export function getInstallDir(): string {
  const fromEnv = process.env.TM_INSTALL_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return process.cwd();
}

export function getUpdatesDir(): string {
  return path.join(getInstallDir(), "Updates");
}

export function getRollbackDir(): string {
  return path.join(getUpdatesDir(), "rollback");
}

export function getVersionFilePath(): string {
  return path.join(getInstallDir(), "version.json");
}

export function getStateFilePath(): string {
  return path.join(getUpdatesDir(), "state.json");
}

export function getUpdateLogPath(): string {
  return path.join(getUpdatesDir(), "update.log");
}

export function ensureUpdatesDir(): string {
  const dir = getUpdatesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isUpdateSupportedPlatform(): boolean {
  return process.platform === "win32";
}
