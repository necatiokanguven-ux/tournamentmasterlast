import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  getOrCreateMachineRecord,
  readLicenseRecord,
  verifyRemoteLicense,
  type ResolvedLicenseStatus,
} from "./licenseCore";

const ENTITLEMENT_FILE = path.join(process.cwd(), "license-entitlement.json");
const RAM_CACHE_TTL_MS = 60_000;
const OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;
const ENTITLEMENT_HMAC_SALT = "tournament-master-offline-entitlement-v1";

type OfflineEntitlement = {
  licenseKey: string;
  machineId: string;
  type?: string;
  expiresAt?: string | null;
  verifiedAt: string;
  offlineUntil: string;
  hmac: string;
};

type MemoryCache = {
  licenseKey: string;
  machineId: string;
  status: ResolvedLicenseStatus;
  cachedAt: number;
};

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeOfflineUntil(verifiedAtMs: number, expiresAt?: string | null): string {
  const graceUntilMs = verifiedAtMs + OFFLINE_GRACE_MS;
  const licenseExpiresMs = parseTimestamp(expiresAt);

  if (licenseExpiresMs !== null && licenseExpiresMs < graceUntilMs) {
    return new Date(licenseExpiresMs).toISOString();
  }

  return new Date(graceUntilMs).toISOString();
}

function signEntitlement(payload: Omit<OfflineEntitlement, "hmac">): string {
  const canonical = [
    payload.licenseKey,
    payload.machineId,
    payload.type ?? "",
    payload.expiresAt ?? "",
    payload.verifiedAt,
    payload.offlineUntil,
  ].join("|");

  return crypto
    .createHmac("sha256", ENTITLEMENT_HMAC_SALT)
    .update(canonical)
    .digest("hex");
}

function saveOfflineEntitlement(status: ResolvedLicenseStatus, verifiedAtMs: number) {
  if (!status.valid || !status.licenseKey) {
    clearOfflineEntitlement();
    return;
  }

  const verifiedAt = new Date(verifiedAtMs).toISOString();
  const payload: Omit<OfflineEntitlement, "hmac"> = {
    licenseKey: status.licenseKey,
    machineId: status.machineId,
    type: status.type,
    expiresAt: status.expiresAt ?? null,
    verifiedAt,
    offlineUntil: computeOfflineUntil(verifiedAtMs, status.expiresAt),
  };

  const record: OfflineEntitlement = {
    ...payload,
    hmac: signEntitlement(payload),
  };

  writeJsonFile(ENTITLEMENT_FILE, record);
}

function clearOfflineEntitlement() {
  if (fs.existsSync(ENTITLEMENT_FILE)) {
    fs.unlinkSync(ENTITLEMENT_FILE);
  }
}

function isEntitlementUsable(
  entitlement: OfflineEntitlement,
  licenseKey: string,
  machineId: string,
  nowMs: number,
): boolean {
  if (entitlement.licenseKey !== licenseKey || entitlement.machineId !== machineId) {
    return false;
  }

  const expectedHmac = signEntitlement({
    licenseKey: entitlement.licenseKey,
    machineId: entitlement.machineId,
    type: entitlement.type,
    expiresAt: entitlement.expiresAt ?? null,
    verifiedAt: entitlement.verifiedAt,
    offlineUntil: entitlement.offlineUntil,
  });

  if (expectedHmac !== entitlement.hmac) {
    return false;
  }

  const offlineUntilMs = parseTimestamp(entitlement.offlineUntil);
  if (offlineUntilMs === null || nowMs >= offlineUntilMs) {
    return false;
  }

  const licenseExpiresMs = parseTimestamp(entitlement.expiresAt);
  if (licenseExpiresMs !== null && nowMs >= licenseExpiresMs) {
    return false;
  }

  return true;
}

function buildOfflineStatus(
  entitlement: OfflineEntitlement,
  machineName: string | null,
): ResolvedLicenseStatus {
  return {
    licenseKey: entitlement.licenseKey,
    machineId: entitlement.machineId,
    machineName,
    valid: true,
    type: entitlement.type,
    expiresAt: entitlement.expiresAt ?? null,
    message:
      "License is valid in offline mode. Reconnect to the internet within 24 hours to refresh license status.",
  };
}

function buildMissingLicenseStatus(
  machineId: string,
  machineName: string | null,
): ResolvedLicenseStatus {
  return {
    licenseKey: null,
    machineId,
    machineName,
    valid: false,
    message: "No license key saved on this machine.",
  };
}

function buildUnreachableStatus(
  licenseKey: string,
  machineId: string,
  machineName: string | null,
): ResolvedLicenseStatus {
  return {
    licenseKey,
    machineId,
    machineName,
    valid: false,
    message: "Could not reach license server. Check internet connection.",
  };
}

class LicenseManager {
  private memoryCache: MemoryCache | null = null;
  private inFlightRefresh: Promise<ResolvedLicenseStatus> | null = null;

  async getLicenseStatus(): Promise<ResolvedLicenseStatus> {
    const machine = getOrCreateMachineRecord();
    const savedLicense = readLicenseRecord();

    if (!savedLicense?.licenseKey) {
      this.memoryCache = null;
      return buildMissingLicenseStatus(machine.machineId, machine.machineName);
    }

    const nowMs = Date.now();
    if (
      this.memoryCache &&
      nowMs - this.memoryCache.cachedAt < RAM_CACHE_TTL_MS &&
      this.memoryCache.licenseKey === savedLicense.licenseKey &&
      this.memoryCache.machineId === machine.machineId
    ) {
      return this.memoryCache.status;
    }

    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    this.inFlightRefresh = this.refreshStatus(savedLicense.licenseKey, machine).finally(() => {
      this.inFlightRefresh = null;
    });

    return this.inFlightRefresh;
  }

  async forceRefresh(): Promise<ResolvedLicenseStatus> {
    this.memoryCache = null;
    return this.getLicenseStatus();
  }

  private setMemoryCache(licenseKey: string, machineId: string, status: ResolvedLicenseStatus) {
    this.memoryCache = {
      licenseKey,
      machineId,
      status,
      cachedAt: Date.now(),
    };
  }

  private async refreshStatus(
    licenseKey: string,
    machine: ReturnType<typeof getOrCreateMachineRecord>,
  ): Promise<ResolvedLicenseStatus> {
    try {
      const remote = await verifyRemoteLicense(licenseKey, machine.machineId);
      const status: ResolvedLicenseStatus = {
        licenseKey,
        machineId: machine.machineId,
        machineName: machine.machineName,
        valid: Boolean(remote.valid),
        message: remote.message || (remote.valid ? "License is valid." : "License is invalid."),
        type: remote.type,
        expiresAt: remote.expiresAt ?? null,
      };

      if (status.valid) {
        saveOfflineEntitlement(status, Date.now());
      } else {
        clearOfflineEntitlement();
      }

      this.setMemoryCache(licenseKey, machine.machineId, status);
      return status;
    } catch {
      const entitlement = readJsonFile<OfflineEntitlement>(ENTITLEMENT_FILE);
      if (entitlement && isEntitlementUsable(entitlement, licenseKey, machine.machineId, Date.now())) {
        const offlineStatus = buildOfflineStatus(entitlement, machine.machineName);
        this.setMemoryCache(licenseKey, machine.machineId, offlineStatus);
        return offlineStatus;
      }

      const unreachableStatus = buildUnreachableStatus(
        licenseKey,
        machine.machineId,
        machine.machineName,
      );
      this.setMemoryCache(licenseKey, machine.machineId, unreachableStatus);
      return unreachableStatus;
    }
  }
}

export const licenseManager = new LicenseManager();
