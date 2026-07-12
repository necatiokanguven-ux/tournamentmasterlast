import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import type { Express, Request, Response, NextFunction } from "express";

const MACHINE_FILE = path.join(process.cwd(), "machine.json");
const LICENSE_FILE = path.join(process.cwd(), "license.json");
const LICENSE_API_BASE =
  process.env.LICENSE_API_URL || "https://api.pokerclup.com/api/licenses";

type MachineRecord = {
  machineId: string;
  machineName: string | null;
  createdAt: string;
};

type LicenseRecord = {
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

function writeJsonFile(filePath: string, data: unknown) {
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

async function verifyRemoteLicense(licenseKey: string, machineId: string): Promise<RemoteVerifyResponse> {
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

export async function resolveLicenseStatus(): Promise<ResolvedLicenseStatus> {
  const machine = getOrCreateMachineRecord();
  const savedLicense = readJsonFile<LicenseRecord>(LICENSE_FILE);

  if (!savedLicense?.licenseKey) {
    return {
      licenseKey: null,
      machineId: machine.machineId,
      machineName: machine.machineName,
      valid: false,
      message: "No license key saved on this machine.",
    };
  }

  try {
    const remote = await verifyRemoteLicense(savedLicense.licenseKey, machine.machineId);
    return {
      licenseKey: savedLicense.licenseKey,
      machineId: machine.machineId,
      machineName: machine.machineName,
      valid: Boolean(remote.valid),
      message: remote.message || (remote.valid ? "License is valid." : "License is invalid."),
      type: remote.type,
      expiresAt: remote.expiresAt ?? null,
    };
  } catch {
    return {
      licenseKey: savedLicense.licenseKey,
      machineId: machine.machineId,
      machineName: machine.machineName,
      valid: false,
      message: "Could not reach license server. Check internet connection.",
    };
  }
}

export function requireValidLicense() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const status = await resolveLicenseStatus();
    if (!status.valid) {
      res.status(403).json({
        licensed: false,
        message: status.message || "A valid license is required to use Tournament Master.",
      });
      return;
    }

    next();
  };
}

export function registerLicenseRoutes(app: Express) {
  app.get("/api/license/machine", (_req: Request, res: Response) => {
    const machine = getOrCreateMachineRecord();
    res.json(machine);
  });

  app.get("/api/license/status", async (_req: Request, res: Response) => {
    const status = await resolveLicenseStatus();
    res.json(status);
  });

  app.post("/api/license/save", (req: Request, res: Response) => {
    const licenseKey = typeof req.body?.licenseKey === "string" ? req.body.licenseKey.trim() : "";

    if (!licenseKey) {
      res.status(400).json({ message: "License key is required." });
      return;
    }

    const record: LicenseRecord = {
      licenseKey,
      savedAt: new Date().toISOString(),
    };

    writeJsonFile(LICENSE_FILE, record);
    res.json({ success: true, message: "License saved locally." });
  });
}
