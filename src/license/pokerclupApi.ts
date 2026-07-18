export const POKERCLUP_AUTH_API = "https://api.pokerclup.com/api/auth";
export const POKERCLUP_LICENSE_API = "https://api.pokerclup.com/api/licenses";
export const POKERCLUP_WEB_BASE = "https://pokerclup.com";

const TOKEN_KEY = "tm-pokerclup-token";
const USER_KEY = "tm-pokerclup-user";

export type PokerClupUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredAuthUser(): PokerClupUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PokerClupUser) : null;
  } catch {
    return null;
  }
}

export function storeAuthSession(token: string, user: PokerClupUser) {
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

export async function loginPokerClup(email: string, password: string): Promise<PokerClupUser> {
  const response = await fetch(`${POKERCLUP_AUTH_API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = (await response.json()) as {
    token?: string;
    user?: PokerClupUser;
    message?: string;
  };

  if (!response.ok || !data.token || !data.user) {
    throw new Error(data.message || "Login failed.");
  }

  storeAuthSession(data.token, data.user);
  return data.user;
}

export type TrialEligibility = {
  trialEligible: boolean;
  trialUsed: boolean;
  message: string;
};

export async function fetchTrialEligibility(machineId: string): Promise<TrialEligibility> {
  const response = await fetch(
    `${POKERCLUP_LICENSE_API}/machine/trial-eligibility?machineId=${encodeURIComponent(machineId)}`,
  );
  const data = (await response.json()) as TrialEligibility & { message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Could not check trial eligibility.");
  }

  return data;
}

export type ProvisionedLicense = {
  valid: boolean;
  licenseKey: string;
  type?: string;
  expiresAt?: string | null;
  message?: string;
};

async function authedLicensePost(path: string, body: Record<string, string | null>) {
  const token = getStoredAuthToken();
  if (!token) {
    throw new Error("Please sign in to your PokerClup account first.");
  }

  const response = await fetch(`${POKERCLUP_LICENSE_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as ProvisionedLicense & { message?: string };

  if (!response.ok || !data.valid || !data.licenseKey) {
    throw new Error(data.message || "License request failed.");
  }

  return data;
}

export async function requestMachineTrial(
  machineId: string,
  machineName: string | null,
): Promise<ProvisionedLicense> {
  return authedLicensePost("/machine/request-trial", {
    machineId,
    machineName,
  });
}

export async function claimMachineLicense(
  machineId: string,
  machineName: string | null,
): Promise<ProvisionedLicense> {
  return authedLicensePost("/machine/claim", {
    machineId,
    machineName,
  });
}

export function buildPurchaseUrl(planId: "short" | "annual", machineId: string): string {
  const params = new URLSearchParams({
    plan: planId,
    machineId,
  });
  return `${POKERCLUP_WEB_BASE}/purchase?${params.toString()}`;
}

export function buildRegisterUrl(): string {
  return `${POKERCLUP_WEB_BASE}/register`;
}
