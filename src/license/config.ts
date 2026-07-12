export const LICENSE_API_BASE = "https://api.pokerclup.com/api/licenses";

export type LicenseVerifyResponse = {
  valid: boolean;
  message?: string;
  type?: string;
  expiresAt?: string | null;
  machineBound?: boolean;
  requiresActivation?: boolean;
  activated?: boolean;
  machineId?: string;
  machineName?: string | null;
};

export type LocalLicenseStatus = {
  licenseKey: string | null;
  machineId: string;
  machineName: string | null;
  valid: boolean;
  message: string;
  type?: string;
  expiresAt?: string | null;
};
