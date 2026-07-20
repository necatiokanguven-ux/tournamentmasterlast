import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export const LICENSE_API_BASE =
  process.env.LICENSE_API_URL || "https://api.pokerclup.com/api/licenses";

export type MachineRecord = {
  machineId: string;
  machineName: string | null;
  createdAt: string;
};

export type LicenseRecord = {
  licenseKey: string;
  savedAt: string;
};

type RemoteVerifyResponse = {
  valid?: boolean;
  message?: string;
  type?: string;
  expiresAt?: string | null;
  machineId?: string;
  boundMachineId?: string;
  machineBound?: boolean;
};

export type ResolvedLicenseStatus = {
  licenseKey: string | null;
  machineId: string;
  machineName: string | null;
  valid: boolean;
  message: string;
  type?: string;
  expiresAt?: string | null;
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

export function writeJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function getMachineName(): string {
  return process.env.COMPUTERNAME || process.env.HOSTNAME || os.hostname() || "Salon PC";
}

/** Same physical PC should always resolve to the same machine ID across reinstalls. */
export function deriveStableMachineId(): string {
  const hostname = os.hostname();
  const computerName = process.env.COMPUTERNAME || process.env.HOSTNAME || hostname;
  const seed = `tournament-master|v1|${computerName}|${hostname}|${os.platform()}|${os.arch()}`;
  const hash = crypto.createHash("sha256").update(seed).digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function readBoundMachineId(response: RemoteVerifyResponse): string | null {
  const candidate = response.boundMachineId || response.machineId;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

async function verifyAndAdoptBoundMachine(
  licenseKey: string,
  response: RemoteVerifyResponse,
): Promise<{ machine: MachineRecord; remote: RemoteVerifyResponse } | null> {
  const boundMachineId = readBoundMachineId(response);
  if (!boundMachineId) {
    return null;
  }

  const current = getOrCreateMachineRecord();
  if (current.machineId === boundMachineId) {
    return null;
  }

  const rebound = await verifyRemoteLicense(licenseKey, boundMachineId);
  if (!rebound.valid) {
    return null;
  }

  return {
    machine: adoptMachineRecord(boundMachineId),
    remote: rebound,
  };
}

/** Persistent license state lives with tournament data — not the install/staging folder. */
export function resolveLicenseConfigDir(): string {
  const dataDir = process.env.TM_DATA_DIR?.trim();
  if (dataDir) {
    return path.join(dataDir, "config");
  }

  return path.join(process.cwd(), "data", "config");
}

export function resolveMachineFilePath(): string {
  return path.join(resolveLicenseConfigDir(), "machine.json");
}

export function resolveLicenseFilePath(): string {
  return path.join(resolveLicenseConfigDir(), "license.json");
}

export function resolveEntitlementFilePath(): string {
  return path.join(resolveLicenseConfigDir(), "license-entitlement.json");
}

/** @deprecated Use resolveMachineFilePath() — kept for legacy migration lookups. */
export const MACHINE_FILE = path.join(process.cwd(), "machine.json");

/** @deprecated Use resolveLicenseFilePath() — kept for legacy migration lookups. */
export const LICENSE_FILE = path.join(process.cwd(), "license.json");

function listLegacyMachineFilePaths(): string[] {
  const candidates = [
    path.join(process.cwd(), "machine.json"),
    path.join(process.cwd(), "data", "config", "machine.json"),
  ];

  const installDir = process.env.TM_INSTALL_DIR?.trim();
  if (installDir) {
    candidates.push(path.join(installDir, "machine.json"));
    candidates.push(path.join(installDir, "data", "config", "machine.json"));
  }

  return [...new Set(candidates.map((candidate) => path.normalize(candidate)))];
}

function listLegacyLicenseFilePaths(): string[] {
  const candidates = [
    path.join(process.cwd(), "license.json"),
    path.join(process.cwd(), "data", "config", "license.json"),
  ];

  const installDir = process.env.TM_INSTALL_DIR?.trim();
  if (installDir) {
    candidates.push(path.join(installDir, "license.json"));
    candidates.push(path.join(installDir, "data", "config", "license.json"));
  }

  return [...new Set(candidates.map((candidate) => path.normalize(candidate)))];
}

export function readLegacyMachineRecords(): MachineRecord[] {
  const canonicalPath = path.normalize(resolveMachineFilePath());
  const seen = new Set<string>();
  const records: MachineRecord[] = [];

  for (const filePath of listLegacyMachineFilePaths()) {
    if (filePath === canonicalPath) {
      continue;
    }

    const record = readJsonFile<MachineRecord>(filePath);
    if (record?.machineId && !seen.has(record.machineId)) {
      seen.add(record.machineId);
      records.push(record);
    }
  }

  return records;
}

function migrateLegacyLicenseRecord(): LicenseRecord | null {
  const canonicalPath = path.normalize(resolveLicenseFilePath());
  const existing = readJsonFile<LicenseRecord>(canonicalPath);
  if (existing?.licenseKey) {
    return existing;
  }

  for (const filePath of listLegacyLicenseFilePaths()) {
    if (filePath === canonicalPath) {
      continue;
    }

    const legacy = readJsonFile<LicenseRecord>(filePath);
    if (legacy?.licenseKey) {
      writeJsonFile(canonicalPath, legacy);
      return legacy;
    }
  }

  return null;
}

export function getOrCreateMachineRecord(): MachineRecord {
  const machinePath = resolveMachineFilePath();
  const existing = readJsonFile<MachineRecord>(machinePath);
  if (existing?.machineId) {
    return existing;
  }

  for (const legacy of readLegacyMachineRecords()) {
    writeJsonFile(machinePath, legacy);
    return legacy;
  }

  const record: MachineRecord = {
    machineId: deriveStableMachineId(),
    machineName: getMachineName(),
    createdAt: new Date().toISOString(),
  };

  writeJsonFile(machinePath, record);
  return record;
}

export function adoptMachineRecord(
  machineId: string,
  machineName: string | null = null,
): MachineRecord {
  const current = getOrCreateMachineRecord();
  if (current.machineId === machineId) {
    return current;
  }

  const record: MachineRecord = {
    machineId,
    machineName: machineName ?? current.machineName ?? getMachineName(),
    createdAt: current.createdAt ?? new Date().toISOString(),
  };

  writeJsonFile(resolveMachineFilePath(), record);
  return record;
}

export function readLicenseRecord(): LicenseRecord | null {
  return migrateLegacyLicenseRecord();
}

export async function verifyRemoteLicense(
  licenseKey: string,
  machineId: string,
): Promise<RemoteVerifyResponse> {
  const response = await fetch(`${LICENSE_API_BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, machineId }),
  });

  const data = (await response.json()) as RemoteVerifyResponse;
  if (!response.ok) {
    return {
      valid: false,
      message: data.message || "License verification failed.",
    };
  }

  return data;
}

async function activateRemoteLicense(
  licenseKey: string,
  machine: MachineRecord,
): Promise<RemoteVerifyResponse> {
  const response = await fetch(`${LICENSE_API_BASE}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licenseKey,
      machineId: machine.machineId,
      machineName: machine.machineName,
    }),
  });

  const data = (await response.json()) as RemoteVerifyResponse;
  if (!response.ok) {
    return {
      valid: false,
      message: data.message || "License activation failed.",
    };
  }

  return data;
}

function isAlreadyBoundMessage(message?: string | null): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return normalized.includes("already bound") || normalized.includes("another machine");
}

/**
 * Find the machine ID this license is valid for on this PC.
 * Handles reinstall/staging folder changes that previously created a new machine UUID.
 */
export async function resolveLicensedMachineRecord(licenseKey: string): Promise<{
  machine: MachineRecord;
  remote: RemoteVerifyResponse;
}> {
  const candidates: MachineRecord[] = [];
  const seen = new Set<string>();

  const pushCandidate = (record: MachineRecord | null | undefined) => {
    if (!record?.machineId || seen.has(record.machineId)) {
      return;
    }
    seen.add(record.machineId);
    candidates.push(record);
  };

  pushCandidate(getOrCreateMachineRecord());
  for (const legacy of readLegacyMachineRecords()) {
    pushCandidate(legacy);
  }

  for (const candidate of candidates) {
    const remote = await verifyRemoteLicense(licenseKey, candidate.machineId);
    if (remote.valid) {
      const machine = adoptMachineRecord(candidate.machineId, candidate.machineName);
      return { machine, remote };
    }

    const adopted = await verifyAndAdoptBoundMachine(licenseKey, remote);
    if (adopted) {
      return adopted;
    }
  }

  const machine = candidates[0] ?? getOrCreateMachineRecord();
  const remote = await verifyRemoteLicense(licenseKey, machine.machineId);
  const adopted = remote.valid ? null : await verifyAndAdoptBoundMachine(licenseKey, remote);
  if (adopted) {
    return adopted;
  }

  return { machine, remote };
}

export async function activateLicenseOnMachine(licenseKey: string): Promise<{
  machine: MachineRecord;
  remote: RemoteVerifyResponse;
}> {
  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) {
    return {
      machine: getOrCreateMachineRecord(),
      remote: { valid: false, message: "License key is required." },
    };
  }

  const verified = await resolveLicensedMachineRecord(trimmedKey);
  if (verified.remote.valid) {
    return verified;
  }

  let machine = verified.machine;
  let activateResult = await activateRemoteLicense(trimmedKey, machine);

  if (!activateResult.valid && isAlreadyBoundMessage(activateResult.message)) {
    const adopted = await verifyAndAdoptBoundMachine(trimmedKey, activateResult);
    if (adopted) {
      return adopted;
    }

    const rebound = await resolveLicensedMachineRecord(trimmedKey);
    if (rebound.remote.valid) {
      return rebound;
    }

    for (const legacy of readLegacyMachineRecords()) {
      if (legacy.machineId === machine.machineId) {
        continue;
      }

      activateResult = await activateRemoteLicense(trimmedKey, legacy);
      if (activateResult.valid) {
        machine = adoptMachineRecord(legacy.machineId, legacy.machineName);
        return { machine, remote: activateResult };
      }
    }
  }

  if (activateResult.valid) {
    return { machine, remote: activateResult };
  }

  return { machine, remote: activateResult };
}

export function saveLicenseRecord(licenseKey: string): LicenseRecord {
  const record: LicenseRecord = {
    licenseKey: licenseKey.trim(),
    savedAt: new Date().toISOString(),
  };

  writeJsonFile(resolveLicenseFilePath(), record);
  return record;
}
