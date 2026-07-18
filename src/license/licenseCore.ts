import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export const MACHINE_FILE = path.join(process.cwd(), "machine.json");
export const LICENSE_FILE = path.join(process.cwd(), "license.json");
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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function getMachineName(): string {
  return process.env.COMPUTERNAME || process.env.HOSTNAME || os.hostname() || "Salon PC";
}

export function getOrCreateMachineRecord(): MachineRecord {
  const existing = readJsonFile<MachineRecord>(MACHINE_FILE);
  if (existing?.machineId) {
    return existing;
  }

  const record: MachineRecord = {
    machineId: crypto.randomUUID(),
    machineName: getMachineName(),
    createdAt: new Date().toISOString(),
  };

  writeJsonFile(MACHINE_FILE, record);
  return record;
}

export function readLicenseRecord(): LicenseRecord | null {
  return readJsonFile<LicenseRecord>(LICENSE_FILE);
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
