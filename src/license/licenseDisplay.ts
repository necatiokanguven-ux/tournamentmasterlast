import type { LocalLicenseStatus } from "./config";
import { getLicenseDaysRemaining } from "../shared/licenseExpiry";

export { getLicenseDaysRemaining, formatLicenseExpiry } from "../shared/licenseExpiry";

export type LicenseNavStatus = {
  primary: string;
  secondary?: string;
  tone: "loading" | "active" | "inactive";
};

export function getLicenseNavStatus(
  loading: boolean,
  isLicensed: boolean,
  status: LocalLicenseStatus | null,
): LicenseNavStatus {
  if (loading) {
    return {
      primary: "Checking...",
      tone: "loading",
    };
  }

  if (!isLicensed) {
    return {
      primary: "Not Active",
      secondary: status?.message ? truncateMessage(status.message) : undefined,
      tone: "inactive",
    };
  }

  const daysRemaining = getLicenseDaysRemaining(status?.expiresAt);
  if (daysRemaining === null) {
    return {
      primary: "Active",
      tone: "active",
    };
  }

  if (daysRemaining === 0) {
    return {
      primary: "Active",
      secondary: "Expires today",
      tone: "active",
    };
  }

  if (daysRemaining === 1) {
    return {
      primary: "Active",
      secondary: "1 day left",
      tone: "active",
    };
  }

  return {
    primary: "Active",
    secondary: `${daysRemaining} days left`,
    tone: "active",
  };
}

function truncateMessage(message: string, maxLength = 42): string {
  const trimmed = message.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}
