import { clearStoredSessionToken, getOrCreateDeviceId } from "./dealerSession";
import { localApi } from "../config/api";

const IDENTITY_KEY = "tm-dealer-identity";
const IDENTITY_CHANGED_EVENT = "dealer-identity-changed";

export type StoredDealerIdentity = {
  dealerId: string;
  displayName: string;
  role: string;
  firstName: string;
  lastName: string;
};

export function readDealerIdentity(): StoredDealerIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDealerIdentity>;
    if (!parsed.dealerId || !parsed.displayName) return null;
    return {
      dealerId: parsed.dealerId,
      displayName: parsed.displayName,
      role: parsed.role ?? "dealer",
      firstName: parsed.firstName ?? parsed.displayName.split(" ")[0] ?? "",
      lastName: parsed.lastName ?? parsed.displayName.split(" ").slice(1).join(" ") ?? "",
    };
  } catch {
    return null;
  }
}

function notifyIdentityChanged(): void {
  window.dispatchEvent(new Event(IDENTITY_CHANGED_EVENT));
}

export function writeDealerIdentity(identity: StoredDealerIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  notifyIdentityChanged();
}

export function clearDealerIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
  notifyIdentityChanged();
}

/** End server phone session, clear tokens, and remove stored identity. */
export async function switchDealerIdentity(): Promise<void> {
  const current = readDealerIdentity();
  if (current) {
    clearStoredSessionToken(current.dealerId);
    try {
      await fetch(localApi("/api/dealer-control/phone/session/end"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealerId: current.dealerId,
          deviceId: getOrCreateDeviceId(),
        }),
      });
    } catch {
      // ignore network errors — local identity is still cleared
    }
  }
  clearDealerIdentity();
}

export function subscribeDealerIdentityChanges(listener: () => void): () => void {
  window.addEventListener(IDENTITY_CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(IDENTITY_CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
