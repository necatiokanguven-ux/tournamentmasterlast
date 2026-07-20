const STORAGE_KEY = "tm-dealer-device-id";

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `dealer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDealerDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing?.trim()) {
    return existing.trim();
  }

  const created = createDeviceId();
  localStorage.setItem(STORAGE_KEY, created);
  return created;
}
