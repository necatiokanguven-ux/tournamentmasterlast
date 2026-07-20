import {
  LICENSE_API_BASE,
  type LicenseVerifyResponse,
  type LocalLicenseStatus,
} from "./config";

const MACHINE_STORAGE_KEY = "tm-machine";
const LICENSE_STORAGE_KEY = "tm-license";

type MachineRecord = {
  machineId: string;
  machineName: string | null;
  createdAt: string;
};

type LicenseRecord = {
  licenseKey: string;
  savedAt: string;
};

function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getBrowserMachineName(): string {
  return window.navigator.userAgent.slice(0, 120) || "Browser";
}

export function getOrCreateBrowserMachine(): MachineRecord {
  const existing = readStorage<MachineRecord>(MACHINE_STORAGE_KEY);
  if (existing?.machineId) {
    return existing;
  }

  const record: MachineRecord = {
    machineId: crypto.randomUUID(),
    machineName: getBrowserMachineName(),
    createdAt: new Date().toISOString(),
  };

  writeStorage(MACHINE_STORAGE_KEY, record);
  return record;
}

export function getSavedBrowserLicense(): LicenseRecord | null {
  return readStorage<LicenseRecord>(LICENSE_STORAGE_KEY);
}

export function saveBrowserLicense(licenseKey: string) {
  writeStorage(LICENSE_STORAGE_KEY, {
    licenseKey,
    savedAt: new Date().toISOString(),
  } satisfies LicenseRecord);
}

async function verifyRemoteLicense(
  licenseKey: string,
  machineId: string,
): Promise<LicenseVerifyResponse> {
  const response = await fetch(`${LICENSE_API_BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, machineId }),
  });

  const data = (await response.json()) as LicenseVerifyResponse;
  if (!response.ok) {
    return {
      valid: false,
      message: data.message || "License verification failed.",
    };
  }

  return data;
}

export async function resolveBrowserLicenseStatus(): Promise<LocalLicenseStatus> {
  const machine = getOrCreateBrowserMachine();
  const savedLicense = getSavedBrowserLicense();

  if (!savedLicense?.licenseKey) {
    return {
      licenseKey: null,
      machineId: machine.machineId,
      machineName: machine.machineName,
      valid: false,
      message: "Enter your license key from pokerclup.com to activate Tournament Master.",
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

export async function activateBrowserLicense(licenseKey: string): Promise<LocalLicenseStatus> {
  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) {
    throw new Error("License key is required.");
  }

  const machine = getOrCreateBrowserMachine();
  const verifyResult = await verifyRemoteLicense(trimmedKey, machine.machineId);
  if (verifyResult.valid) {
    saveBrowserLicense(trimmedKey);
    return resolveBrowserLicenseStatus();
  }

  const activateResponse = await fetch(`${LICENSE_API_BASE}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licenseKey: trimmedKey,
      machineId: machine.machineId,
      machineName: machine.machineName,
    }),
  });

  const activateData = (await activateResponse.json()) as LicenseVerifyResponse;
  if (!activateResponse.ok || !activateData.valid) {
    const retryVerify = await verifyRemoteLicense(trimmedKey, machine.machineId);
    if (retryVerify.valid) {
      saveBrowserLicense(trimmedKey);
      return resolveBrowserLicenseStatus();
    }

    throw new Error(activateData.message || "License activation failed.");
  }

  saveBrowserLicense(trimmedKey);
  return resolveBrowserLicenseStatus();
}
