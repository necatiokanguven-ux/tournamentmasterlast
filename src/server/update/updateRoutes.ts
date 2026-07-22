import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { Express, Request } from "express";
import { fetchUpdateManifest } from "./updateManifest";
import { isNewerVersion, isVersionAtLeast } from "./updateCompare";
import { readLocalVersion } from "./updateVersion";
import {
  downloadUpdateInstaller,
  getInstallerPath,
  getActiveDownloadPromise,
  isInstallerVerified,
} from "./updateDownload";
import { appendUpdateLog, readUpdateLogTail } from "./updateLog";
import {
  ensureUpdatesDir,
  getInstallDir,
  isUpdateSupportedPlatform,
} from "./updatePaths";
import {
  isUpdateSnoozed,
  readUpdateState,
  writeUpdateState,
} from "./updateState";

function isLocalRequest(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function requireLocal(req: Request, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: "LOCAL_ONLY" });
    return false;
  }
  return true;
}

export function registerUpdateRoutes(app: Express): void {
  app.get("/api/app/version", (_req, res) => {
    res.json(readLocalVersion());
  });

  app.get("/api/update/check", async (req, res) => {
    if (!requireLocal(req, res)) {
      return;
    }

    const local = readLocalVersion();
    const state = readUpdateState();
    writeUpdateState({ lastCheckAt: new Date().toISOString() });

    if (!isUpdateSupportedPlatform()) {
      res.json({
        supported: false,
        currentVersion: local.version,
        updateAvailable: false,
        mandatory: false,
        notes: [],
        downloadReady: false,
        snoozed: false,
        state,
      });
      return;
    }

    const manifest = await fetchUpdateManifest("win");
    if (!manifest) {
      res.json({
        supported: true,
        currentVersion: local.version,
        updateAvailable: false,
        mandatory: false,
        notes: [],
        downloadReady: false,
        snoozed: isUpdateSnoozed(state),
        state,
        checkFailed: true,
      });
      return;
    }

    const updateAvailable = isNewerVersion(manifest.version, local.version);
    const belowMinimum = manifest.minSupportedVersion
      ? !isVersionAtLeast(local.version, manifest.minSupportedVersion)
      : false;
    const mandatory = Boolean(manifest.mandatory || belowMinimum);
    const snoozed = !mandatory && isUpdateSnoozed(state);
    const installerPath = getInstallerPath(manifest.version);
    const verifiedOnDisk = await isInstallerVerified(installerPath, manifest.platform.sha256);
    const downloadReady = verifiedOnDisk;

    res.json({
      supported: true,
      currentVersion: local.version,
      latestVersion: manifest.version,
      updateAvailable: updateAvailable && !snoozed,
      mandatory: mandatory && updateAvailable,
      notes: manifest.notes,
      releasedAt: manifest.releasedAt,
      downloadReady,
      downloadUrl: manifest.platform.url,
      expectedSha256: manifest.platform.sha256,
      expectedSizeBytes: manifest.platform.sizeBytes,
      snoozed,
      snoozedUntil: state.snoozedUntil ?? null,
      belowMinimum,
      state: readUpdateState(),
    });
  });

  app.get("/api/update/status", (req, res) => {
    if (!requireLocal(req, res)) {
      return;
    }

    res.json({
      state: readUpdateState(),
      activeDownload: Boolean(getActiveDownloadPromise()),
    });
  });

  app.get("/api/update/log", (req, res) => {
    if (!requireLocal(req, res)) {
      return;
    }

    res.json({ lines: readUpdateLogTail(40) });
  });

  app.post("/api/update/dismiss", (req, res) => {
    if (!requireLocal(req, res)) {
      return;
    }

    const hours = Number(req.body?.hours ?? 24);
    const safeHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 168) : 24;
    const snoozedUntil = new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
    writeUpdateState({ snoozedUntil });
    appendUpdateLog(`DISMISS snoozedUntil=${snoozedUntil}`);
    res.json({ ok: true, snoozedUntil });
  });

  app.post("/api/update/download", async (req, res) => {
    if (!requireLocal(req, res)) {
      return;
    }

    if (!isUpdateSupportedPlatform()) {
      res.status(400).json({ error: "UNSUPPORTED_PLATFORM" });
      return;
    }

    const manifest = await fetchUpdateManifest("win");
    if (!manifest) {
      res.status(502).json({ error: "MANIFEST_UNAVAILABLE" });
      return;
    }

    const local = readLocalVersion();
    if (!isNewerVersion(manifest.version, local.version)) {
      res.status(409).json({ error: "ALREADY_UP_TO_DATE" });
      return;
    }

    void downloadUpdateInstaller({
      version: manifest.version,
      url: manifest.platform.url,
      expectedSha256: manifest.platform.sha256,
      expectedSizeBytes: manifest.platform.sizeBytes,
    });

    res.json({ ok: true, message: "Download started" });
  });

  app.post("/api/update/apply", async (req, res) => {
    if (!requireLocal(req, res)) {
      return;
    }

    if (!isUpdateSupportedPlatform()) {
      res.status(400).json({ error: "UNSUPPORTED_PLATFORM" });
      return;
    }

    const manifest = await fetchUpdateManifest("win");
    if (!manifest) {
      res.status(502).json({ error: "MANIFEST_UNAVAILABLE" });
      return;
    }

    if (getActiveDownloadPromise()) {
      res.status(409).json({ error: "DOWNLOAD_IN_PROGRESS" });
      return;
    }

    const state = readUpdateState();
    const installerPath = getInstallerPath(manifest.version);
    if (!verified) {
      res.status(409).json({ error: "INSTALLER_NOT_READY" });
      return;
    }

    const local = readLocalVersion();
    const applyScript = path.join(getInstallDir(), "scripts", "apply-update.ps1");
    if (!fs.existsSync(applyScript)) {
      res.status(500).json({ error: "APPLY_SCRIPT_MISSING" });
      return;
    }

    writeUpdateState({
      phase: "applying",
      targetVersion: manifest.version,
      previousVersion: local.version,
      installerPath,
    });
    appendUpdateLog(`APPLY requested version=${manifest.version}`);

    const httpPort = Number(process.env.TM_HTTP_PORT ?? process.env.PORT ?? 3000);
    const logPath = path.join(getInstallDir(), "Updates", "apply-update.log");
    ensureUpdatesDir();
    const logFd = fs.openSync(logPath, "a");

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      applyScript,
      "-InstallDir",
      getInstallDir(),
      "-InstallerPath",
      installerPath,
      "-ExpectedHash",
      manifest.platform.sha256,
      "-TargetVersion",
      manifest.version,
      "-HttpPort",
      String(httpPort),
    ];

    const child = spawn("powershell.exe", args, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: false,
    });
    child.unref();

    res.json({ ok: true, message: "Update installation is starting. Approve the Windows administrator prompt if it appears." });
  });
}
