import fs from "fs";
import { getVersionFilePath } from "./updatePaths";

export interface AppVersionInfo {
  version: string;
  build?: string;
}

export function readLocalVersion(): AppVersionInfo {
  const fallback: AppVersionInfo = { version: "0.0.0", build: "unknown" };

  try {
    const versionPath = getVersionFilePath();
    if (!fs.existsSync(versionPath)) {
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(versionPath, "utf8")) as AppVersionInfo;
    if (!parsed?.version) {
      return fallback;
    }
    return {
      version: String(parsed.version),
      build: parsed.build ? String(parsed.build) : undefined,
    };
  } catch {
    return fallback;
  }
}
