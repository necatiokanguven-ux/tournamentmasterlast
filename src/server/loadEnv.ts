import dotenv from "dotenv";
import fs from "fs";
import path from "path";

/** Load `.env.local` then `.env` from project root and optional TM data dir. */
export function loadProjectEnv(): void {
  const roots = [process.cwd()];
  const dataDir = process.env.TM_DATA_DIR?.trim();
  if (dataDir) {
    roots.push(dataDir);
  }

  for (const root of roots) {
    for (const file of [".env.local", ".env"]) {
      const fullPath = path.join(root, file);
      if (fs.existsSync(fullPath)) {
        dotenv.config({ path: fullPath, override: false });
      }
    }
  }
}
