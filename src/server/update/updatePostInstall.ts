import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getInstallDir } from "./updatePaths";
import { readUpdateState } from "./updateState";

export function schedulePostUpdateHealthCheck(httpPort: number): void {
  if (process.platform !== "win32" || process.env.NODE_ENV !== "production") {
    return;
  }

  const state = readUpdateState();
  if (state.phase !== "awaiting_health") {
    return;
  }

  const scriptPath = path.join(getInstallDir(), "scripts", "verify-post-update.ps1");
  if (!fs.existsSync(scriptPath)) {
    console.warn("[update] verify-post-update.ps1 not found; skipping health check.");
    return;
  }

  setTimeout(() => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-InstallDir",
        getInstallDir(),
        "-HttpPort",
        String(httpPort),
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
    console.log("[update] Scheduled post-update health verification.");
  }, 8_000).unref();
}
