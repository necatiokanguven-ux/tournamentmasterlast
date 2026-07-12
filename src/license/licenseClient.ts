import { isCloudHostedApp, localApi } from "../config/api";
import { LICENSE_API_BASE, type LocalLicenseStatus } from "./config";
import {
  activateBrowserLicense,
  resolveBrowserLicenseStatus,
} from "./browserLicense";

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

  const machineResponse = await fetch(localApi("/api/license/machine"));
  if (!machineResponse.ok) {
    throw new Error("Could not read machine ID from local server.");
  }

  const machineData = (await machineResponse.json()) as {
    machineId: string;
    machineName: string | null;
  };

  const activateResponse = await fetch(`${LICENSE_API_BASE}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licenseKey: trimmedKey,
      machineId: machineData.machineId,
      machineName: machineData.machineName,
    }),
  });

  const activateData = (await activateResponse.json()) as {
    valid?: boolean;
    message?: string;
  };

  if (!activateResponse.ok || !activateData.valid) {
    throw new Error(activateData.message || "License activation failed.");
  }

  const saveResponse = await fetch(localApi("/api/license/save"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey: trimmedKey }),
  });

  if (!saveResponse.ok) {
    throw new Error("License activated remotely but could not save locally.");
  }

  return fetchLicenseStatus();
}
