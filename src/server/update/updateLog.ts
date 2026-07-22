import fs from "fs";
import { ensureUpdatesDir, getUpdateLogPath } from "./updatePaths";

export function appendUpdateLog(message: string): void {
  try {
    ensureUpdatesDir();
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(getUpdateLogPath(), line, "utf8");
  } catch (error) {
    console.warn("[update] Failed to write update.log:", error);
  }
}

export function readUpdateLogTail(maxLines = 20): string[] {
  try {
    const logPath = getUpdateLogPath();
    if (!fs.existsSync(logPath)) {
      return [];
    }
    const content = fs.readFileSync(logPath, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-maxLines);
  } catch {
    return [];
  }
}
