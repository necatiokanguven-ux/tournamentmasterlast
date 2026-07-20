import type { DealerStaff } from "./types";

export const DEALER_PHONE_GRACE_MS = 120_000;

export function isDealerInPhoneGrace(dealer: DealerStaff, now = Date.now()): boolean {
  if (!dealer.phoneGraceUntil) return false;
  return new Date(dealer.phoneGraceUntil).getTime() > now;
}

export function beginPhoneGrace(dealer: DealerStaff, now = Date.now()): void {
  if (isDealerInPhoneGrace(dealer, now)) return;

  dealer.stateBeforeDisconnect = dealer.state;
  dealer.phoneGraceUntil = new Date(now + DEALER_PHONE_GRACE_MS).toISOString();
  dealer.phoneLastSeenAt = new Date(now).toISOString();
}

export function clearPhoneGrace(dealer: DealerStaff): void {
  dealer.phoneGraceUntil = null;
  dealer.stateBeforeDisconnect = null;
}

export function rehydratePhoneSession(
  dealer: DealerStaff,
  sessionToken: string,
  deviceId: string,
  now = Date.now(),
): { ok: true } | { ok: false; error: string } {
  if (!dealer.phoneSessionToken || dealer.phoneSessionToken !== sessionToken) {
    return { ok: false, error: "INVALID_SESSION" };
  }

  if (dealer.phoneDeviceId && dealer.phoneDeviceId !== deviceId) {
    return { ok: false, error: "DEVICE_MISMATCH" };
  }

  dealer.phoneDeviceId = deviceId;
  dealer.phoneLastSeenAt = new Date(now).toISOString();

  if (isDealerInPhoneGrace(dealer, now) && dealer.stateBeforeDisconnect) {
    dealer.state = dealer.stateBeforeDisconnect;
  }

  clearPhoneGrace(dealer);
  return { ok: true };
}

export function startPhoneSession(
  dealer: DealerStaff,
  deviceId: string,
  now = Date.now(),
): string {
  const token = cryptoRandomToken();
  dealer.phoneSessionToken = token;
  dealer.phoneDeviceId = deviceId;
  dealer.phoneLastSeenAt = new Date(now).toISOString();
  clearPhoneGrace(dealer);
  return token;
}

export function processPhoneGraceExpiries(staff: DealerStaff[], now = Date.now()): boolean {
  let changed = false;

  for (const dealer of staff) {
    if (!dealer.phoneGraceUntil) continue;
    if (new Date(dealer.phoneGraceUntil).getTime() > now) continue;

    const prior = dealer.stateBeforeDisconnect ?? dealer.state;
    if (prior === "on_table" || prior === "incoming") {
      dealer.state = "waiting";
      dealer.tableId = null;
      dealer.tableNumber = null;
    }

    clearPhoneGrace(dealer);
    changed = true;
  }

  return changed;
}

function cryptoRandomToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
