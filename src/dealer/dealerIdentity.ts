const IDENTITY_KEY = "tm-dealer-identity";

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

export function writeDealerIdentity(identity: StoredDealerIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function clearDealerIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
}
