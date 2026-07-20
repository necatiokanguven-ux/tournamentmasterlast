import { isCloudHostedApp, localApi } from "../config/api";
import type { LocalLicenseStatus } from "./config";
import {
  activateBrowserLicense,
  getOrCreateBrowserMachine,
  resolveBrowserLicenseStatus,
  saveBrowserLicense,
} from "./browserLicense";
import {
  claimMachineLicense,
  requestMachineTrial,
} from "./pokerclupApi";

export async function fetchLicenseStatus(): Promise<LocalLicenseStatus> {
  if (isCloudHostedApp()) {
    return resolveBrowserLicenseStatus();
  }

  const response = await fetch(localApi("/api/license/status"));
  if (!response.ok) {
    throw new Error("Could not verify license status.");
  }

  return (await response.json()) as LocalLicenseStatus;
}

export async function activateLicenseKey(licenseKey: string): Promise<LocalLicenseStatus> {
  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) {
    throw new Error("License key is required.");
  }

  if (isCloudHostedApp()) {
    return activateBrowserLicense(trimmedKey);
  }

  const activateResponse = await fetch(localApi("/api/license/activate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey: trimmedKey }),
  });

  const activateData = (await activateResponse.json()) as {
    valid?: boolean;
    message?: string;
  };

  if (!activateResponse.ok || !activateData.valid) {
    throw new Error(activateData.message || "License activation failed.");
  }

  return fetchLicenseStatus();
}

async function persistLicenseKey(licenseKey: string): Promise<LocalLicenseStatus> {
  if (isCloudHostedApp()) {
    saveBrowserLicense(licenseKey);
    return activateBrowserLicense(licenseKey);
  }

  const saveResponse = await fetch(localApi("/api/license/save"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey }),
  });

  if (!saveResponse.ok) {
    throw new Error("License received but could not save locally.");
  }

  return fetchLicenseStatus();
}

export async function provisionTrialForMachine(): Promise<LocalLicenseStatus> {
  const machine = isCloudHostedApp()
    ? getOrCreateBrowserMachine()
    : await (async () => {
        const machineResponse = await fetch(localApi("/api/license/machine"));
        if (!machineResponse.ok) {
          throw new Error("Could not read machine ID. Start the local server first.");
        }
        return (await machineResponse.json()) as { machineId: string; machineName: string | null };
      })();

  const result = await requestMachineTrial(machine.machineId, machine.machineName);
  return persistLicenseKey(result.licenseKey);
}

export async function claimPaidLicenseForMachine(): Promise<LocalLicenseStatus> {
  const machine = isCloudHostedApp()
    ? getOrCreateBrowserMachine()
    : await (async () => {
        const machineResponse = await fetch(localApi("/api/license/machine"));
        if (!machineResponse.ok) {
          throw new Error("Could not read machine ID. Start the local server first.");
        }
        return (await machineResponse.json()) as { machineId: string; machineName: string | null };
      })();

  const result = await claimMachineLicense(machine.machineId, machine.machineName);
  return persistLicenseKey(result.licenseKey);
}
