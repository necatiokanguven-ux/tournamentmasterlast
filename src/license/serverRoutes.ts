import type { Express, Request, Response, NextFunction } from "express";
import { licenseManager } from "./LicenseManager";
import {
  getOrCreateMachineRecord,
  writeJsonFile,
  LICENSE_FILE,
  type LicenseRecord,
} from "./licenseCore";

export type { ResolvedLicenseStatus } from "./licenseCore";
export { getOrCreateMachineRecord } from "./licenseCore";
import type { ResolvedLicenseStatus } from "./licenseCore";

export async function resolveLicenseStatus(): Promise<ResolvedLicenseStatus> {
  return licenseManager.getLicenseStatus();
}

export function requireValidLicense() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const status = await licenseManager.getLicenseStatus();
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
    const status = await licenseManager.getLicenseStatus();
    res.json(status);
  });

  app.post("/api/license/save", async (req: Request, res: Response) => {
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
    await licenseManager.forceRefresh();
    res.json({ success: true, message: "License saved locally." });
  });
}
