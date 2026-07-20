/** Venue capacity packages — Dealer Control envelope (QR tracking has separate scaling). */

export type VenuePackageId = "standard" | "venue" | "enterprise";

export type VenuePackageTier = {
  id: VenuePackageId;
  name: string;
  operations: string;
  maxTables: number | null;
  mobileDevicesLabel: string;
  mobileDevicesMax: number | null;
};

export const VENUE_PACKAGE_TIERS: VenuePackageTier[] = [
  {
    id: "standard",
    name: "Standard",
    operations: "Max 20 tables",
    maxTables: 20,
    mobileDevicesLabel: "Max 300 mobile devices",
    mobileDevicesMax: 300,
  },
  {
    id: "venue",
    name: "Venue",
    operations: "20–60 tables (Zone + Multi Operator)",
    maxTables: 60,
    mobileDevicesLabel: "500–700 mobile devices",
    mobileDevicesMax: 700,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    operations: "60+ tables (Zone + Multi Operator)",
    maxTables: null,
    mobileDevicesLabel: "1000+ mobile devices",
    mobileDevicesMax: null,
  },
];

export function getActiveVenuePackageId(): VenuePackageId {
  const raw = import.meta.env.VITE_VENUE_PACKAGE?.trim().toLowerCase();
  if (raw === "venue" || raw === "enterprise") {
    return raw;
  }
  return "standard";
}

export function getVenuePackageTier(id: VenuePackageId): VenuePackageTier {
  return VENUE_PACKAGE_TIERS.find((tier) => tier.id === id) ?? VENUE_PACKAGE_TIERS[0];
}

export type PackageLimitSnapshot = {
  tableCount: number;
  mobileDeviceCount: number;
};

export function exceedsVenuePackageLimits(
  packageId: VenuePackageId,
  snapshot: PackageLimitSnapshot,
): boolean {
  const tier = getVenuePackageTier(packageId);

  if (tier.maxTables !== null && snapshot.tableCount > tier.maxTables) {
    return true;
  }

  if (tier.mobileDevicesMax !== null && snapshot.mobileDeviceCount > tier.mobileDevicesMax) {
    return true;
  }

  return false;
}

export function describePackageLimitExceeded(
  packageId: VenuePackageId,
  snapshot: PackageLimitSnapshot,
): string[] {
  const tier = getVenuePackageTier(packageId);
  const reasons: string[] = [];

  if (tier.maxTables !== null && snapshot.tableCount > tier.maxTables) {
    reasons.push(`${snapshot.tableCount} tables (limit ${tier.maxTables})`);
  }

  if (tier.mobileDevicesMax !== null && snapshot.mobileDeviceCount > tier.mobileDevicesMax) {
    reasons.push(`${snapshot.mobileDeviceCount} mobile devices (limit ${tier.mobileDevicesMax})`);
  }

  return reasons;
}

/** Rough concurrent mobile estimate: seated/active players (QR) + active rotation dealers (phones). */
export function estimateMobileDeviceCount(
  activePlayerCount: number,
  activeRotationDealerCount: number,
): number {
  return activePlayerCount + activeRotationDealerCount;
}
