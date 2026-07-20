import { localApi } from "../config/api";

const DEVICE_ID_KEY = "tm-dealer-device-id";
const SESSION_PREFIX = "tm-dealer-session:";

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getStoredSessionToken(dealerId: string): string | null {
  return localStorage.getItem(`${SESSION_PREFIX}${dealerId}`);
}

export function storeSessionToken(dealerId: string, token: string): void {
  localStorage.setItem(`${SESSION_PREFIX}${dealerId}`, token);
}

export async function ensureDealerPhoneSession(dealerId: string): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  const stored = getStoredSessionToken(dealerId);

  if (stored) {
    const response = await fetch(localApi("/api/dealer-control/phone/rehydrate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, sessionToken: stored, deviceId }),
    });
    if (response.ok) return;
  }

  const response = await fetch(localApi("/api/dealer-control/phone/session/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealerId, deviceId }),
  });

  if (!response.ok) return;

  const data = await response.json();
  if (typeof data.sessionToken === "string") {
    storeSessionToken(dealerId, data.sessionToken);
  }
}
