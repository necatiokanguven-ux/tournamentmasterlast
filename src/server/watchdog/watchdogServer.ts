/**
 * Lightweight localhost watchdog — stays up under PM2 when the main server crashes.
 * POST /restart only succeeds when the main HTTP server is not responding.
 */
import http from "http";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

const WATCHDOG_PORT = Number(process.env.TM_WATCHDOG_PORT) || 3099;
const MAIN_PORT = Number(process.env.TM_HTTP_PORT) || 3000;
const PM2_APP_NAME = "tournament-master";
const INSTALL_DIR = process.env.TM_INSTALL_DIR || process.cwd();

function isLocalRequest(remoteAddress: string | undefined): boolean {
  return (
    remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1"
  );
}

async function isMainServerUp(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${MAIN_PORT}/api/tracking/ping`, {
      signal: AbortSignal.timeout(2_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runPm2Restart(): Promise<boolean> {
  const pm2Bin = path.join(INSTALL_DIR, "node_modules", "pm2", "bin", "pm2");
  const nodeExe = process.execPath;

  try {
    await execFileAsync(nodeExe, [pm2Bin, "restart", PM2_APP_NAME], {
      cwd: INSTALL_DIR,
      timeout: 20_000,
    });
    return true;
  } catch {
    try {
      await execFileAsync("pm2", ["restart", PM2_APP_NAME], {
        cwd: INSTALL_DIR,
        timeout: 20_000,
        shell: process.platform === "win32" ? "cmd.exe" : undefined,
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function runStartBat(): Promise<boolean> {
  const startBat = path.join(INSTALL_DIR, "start.bat");
  try {
    if (process.platform === "win32") {
      await execFileAsync("cmd.exe", ["/c", startBat], {
        cwd: INSTALL_DIR,
        timeout: 15_000,
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function restartMainServer(): Promise<{ ok: boolean; error?: string; method?: string }> {
  if (await isMainServerUp()) {
    return { ok: false, error: "SERVER_ALREADY_RUNNING" };
  }

  if (await runPm2Restart()) {
    return { ok: true, method: "pm2" };
  }

  if (await runStartBat()) {
    return { ok: true, method: "start.bat" };
  }

  return { ok: false, error: "RESTART_FAILED" };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (!isLocalRequest(req.socket.remoteAddress)) {
    sendJson(res, 403, { error: "LOCAL_ONLY" });
    return;
  }

  const url = req.url ?? "";

  if (req.method === "GET" && url === "/ping") {
    sendJson(res, 200, {
      ok: true,
      service: "tournament-master-watchdog",
      mainPort: MAIN_PORT,
    });
    return;
  }

  if (req.method === "POST" && url === "/restart") {
    void restartMainServer().then((result) => {
      if (!result.ok && result.error === "SERVER_ALREADY_RUNNING") {
        sendJson(res, 409, result);
        return;
      }
      if (!result.ok) {
        sendJson(res, 500, result);
        return;
      }
      sendJson(res, 200, result);
    });
    return;
  }

  sendJson(res, 404, { error: "NOT_FOUND" });
});

server.listen(WATCHDOG_PORT, "127.0.0.1", () => {
  console.log(`[watchdog] Listening on 127.0.0.1:${WATCHDOG_PORT} (main server port ${MAIN_PORT})`);
});
