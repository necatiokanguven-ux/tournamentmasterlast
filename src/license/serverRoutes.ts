import type { Express, Request, Response, NextFunction } from "express";
import path from "path";
import { licenseManager } from "./LicenseManager";
import {
  activateLicenseOnMachine,
  getOrCreateMachineRecord,
  resolveLicenseConfigDir,
  resolveLicenseFilePath,
  saveLicenseRecord,
} from "./licenseCore";
import { getLicenseDaysRemaining } from "../shared/licenseExpiry";

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
    res.json({
      ...status,
      daysRemaining: getLicenseDaysRemaining(status.expiresAt),
      licenseFilePath: resolveLicenseFilePath(),
      dataDirectory: path.dirname(resolveLicenseConfigDir()),
    });
  });

  app.post("/api/license/activate", async (req: Request, res: Response) => {
    const licenseKey = typeof req.body?.licenseKey === "string" ? req.body.licenseKey.trim() : "";

    if (!licenseKey) {
      res.status(400).json({ valid: false, message: "License key is required." });
      return;
    }

    try {
      const { machine, remote } = await activateLicenseOnMachine(licenseKey);

      if (!remote.valid) {
        res.status(400).json({
          valid: false,
          message: remote.message || "License activation failed.",
          machineId: machine.machineId,
        });
        return;
      }

      saveLicenseRecord(licenseKey);
      await licenseManager.forceRefresh();

      res.json({
        valid: true,
        message: remote.message || "License activated successfully.",
        type: remote.type,
        expiresAt: remote.expiresAt ?? null,
        machineId: machine.machineId,
        machineName: machine.machineName,
      });
    } catch (error) {
      res.status(502).json({
        valid: false,
        message: error instanceof Error ? error.message : "Could not reach license server.",
      });
    }
  });

  app.post("/api/license/save", async (req: Request, res: Response) => {
    const licenseKey = typeof req.body?.licenseKey === "string" ? req.body.licenseKey.trim() : "";

    if (!licenseKey) {
      res.status(400).json({ message: "License key is required." });
      return;
    }

    saveLicenseRecord(licenseKey);
    await licenseManager.forceRefresh();
    res.json({ success: true, message: "License saved locally." });
  });
}
