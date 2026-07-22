import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { appendUpdateLog } from "./updateLog";
import { ensureUpdatesDir, getUpdatesDir } from "./updatePaths";
import { writeUpdateState } from "./updateState";

export function getInstallerFileName(version: string): string {
  const safeVersion = version.replace(/[^0-9A-Za-z._-]+/g, "_");
  return `TourMasterSetup_${safeVersion}.exe`;
}

export function getInstallerPath(version: string): string {
  return path.join(getUpdatesDir(), getInstallerFileName(version));
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toLowerCase()));
  });
}

let activeDownload: Promise<string | null> | null = null;

export function getActiveDownloadPromise(): Promise<string | null> | null {
  return activeDownload;
}

export async function downloadUpdateInstaller(options: {
  version: string;
  url: string;
  expectedSha256: string;
  expectedSizeBytes?: number;
}): Promise<string | null> {
  if (activeDownload) {
    return activeDownload;
  }

  activeDownload = performDownload(options).finally(() => {
    activeDownload = null;
  });

  return activeDownload;
}

function writeDownloadProgress(options: {
  version: string;
  installerPath: string;
  downloadedBytes: number;
  totalBytes: number;
}): void {
  const percent =
    options.totalBytes > 0
      ? Math.min(100, Math.round((options.downloadedBytes / options.totalBytes) * 100))
      : undefined;

  writeUpdateState({
    phase: "downloading",
    targetVersion: options.version,
    downloadedBytes: options.downloadedBytes,
    totalBytes: options.totalBytes || undefined,
    downloadPercent: percent,
    installerPath: options.installerPath,
  });
}

async function performDownload(options: {
  version: string;
  url: string;
  expectedSha256: string;
  expectedSizeBytes?: number;
}): Promise<string | null> {
  ensureUpdatesDir();
  const installerPath = getInstallerPath(options.version);
  const tempPath = `${installerPath}.download`;

  writeUpdateState({
    phase: "downloading",
    targetVersion: options.version,
    downloadPercent: 0,
    downloadedBytes: 0,
    totalBytes: options.expectedSizeBytes,
    installerPath,
    error: undefined,
    errorCode: undefined,
  });

  appendUpdateLog(`DOWNLOAD started version=${options.version} url=${options.url}`);

  try {
    if (fs.existsSync(installerPath)) {
      const existingHash = await computeFileSha256(installerPath);
      if (existingHash === options.expectedSha256.toLowerCase()) {
        appendUpdateLog("DOWNLOAD skipped existing verified installer");
        writeUpdateState({
          phase: "downloaded",
          targetVersion: options.version,
          downloadPercent: 100,
          installerPath,
        });
        return installerPath;
      }
      fs.unlinkSync(installerPath);
    }

    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30 * 60_000);
    const response = await fetch(options.url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok || !response.body) {
      throw new Error(`Download failed with HTTP ${response.status}`);
    }

    const totalBytes = Number(response.headers.get("content-length") ?? options.expectedSizeBytes ?? 0);
    let downloadedBytes = 0;
    let lastProgressWrite = 0;
    let lastByteAt = Date.now();

    const stallInterval = setInterval(() => {
      if (Date.now() - lastByteAt > 90_000) {
        controller.abort();
      }
    }, 5_000);

    const progressTracker = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloadedBytes += chunk.length;
        lastByteAt = Date.now();
        const now = Date.now();
        if (now - lastProgressWrite >= 400) {
          lastProgressWrite = now;
          writeDownloadProgress({
            version: options.version,
            installerPath,
            downloadedBytes,
            totalBytes,
          });
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(Readable.fromWeb(response.body as never), progressTracker, fs.createWriteStream(tempPath));
    } finally {
      clearInterval(stallInterval);
    }

    writeDownloadProgress({
      version: options.version,
      installerPath,
      downloadedBytes,
      totalBytes: totalBytes || downloadedBytes,
    });

    fs.renameSync(tempPath, installerPath);

    writeUpdateState({ phase: "verifying", targetVersion: options.version, installerPath });

    const hash = await computeFileSha256(installerPath);
    if (hash !== options.expectedSha256.toLowerCase()) {
      fs.unlinkSync(installerPath);
      appendUpdateLog(`DOWNLOAD hash mismatch expected=${options.expectedSha256} actual=${hash}`);
      writeUpdateState({
        phase: "failed",
        targetVersion: options.version,
        error: "Installer verification failed. The downloaded file was deleted.",
        errorCode: "HASH_MISMATCH",
      });
      return null;
    }

    appendUpdateLog(`DOWNLOAD complete sha256=OK size=${downloadedBytes}`);
    writeUpdateState({
      phase: "downloaded",
      targetVersion: options.version,
      downloadPercent: 100,
      downloadedBytes,
      totalBytes: totalBytes || downloadedBytes,
      installerPath,
    });
    return installerPath;
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    appendUpdateLog(`DOWNLOAD failed error=${String(error)}`);
    writeUpdateState({
      phase: "failed",
      targetVersion: options.version,
      error: error instanceof Error ? error.message : "Download failed",
      errorCode: "DOWNLOAD_FAILED",
    });
    return null;
  }
}

export async function isInstallerVerified(installerPath: string, expectedSha256: string): Promise<boolean> {
  if (!fs.existsSync(installerPath)) {
    return false;
  }
  const hash = await computeFileSha256(installerPath);
  return hash === expectedSha256.toLowerCase();
}
