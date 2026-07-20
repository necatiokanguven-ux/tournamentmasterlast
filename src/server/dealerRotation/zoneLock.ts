import type { TournamentDatabase } from "../tournamentDatabase";
import { isDealerZonesEnabled } from "./dealerZoneUtils";

export class ZoneVersionConflictError extends Error {
  readonly code = "ZONE_VERSION_CONFLICT";

  constructor(
    readonly zoneId: string,
    readonly expected: number,
    readonly received: number,
  ) {
    super(`Zone "${zoneId}" was updated by another operator (expected ${expected}, got ${received}).`);
    this.name = "ZoneVersionConflictError";
  }
}

export function getZoneVersion(db: TournamentDatabase, zoneId: string | null): number {
  if (!zoneId) return 0;
  return db.meta.zoneVersions?.[zoneId] ?? 0;
}

export function assertZoneVersion(
  db: TournamentDatabase,
  zoneId: string | null,
  clientVersion: number | undefined,
): void {
  if (!isDealerZonesEnabled() || !zoneId) return;
  if (clientVersion === undefined) return;

  const current = getZoneVersion(db, zoneId);
  if (clientVersion !== current) {
    throw new ZoneVersionConflictError(zoneId, current, clientVersion);
  }
}

export function bumpZoneVersion(db: TournamentDatabase, zoneId: string | null): void {
  if (!isDealerZonesEnabled() || !zoneId) return;
  if (!db.meta.zoneVersions) {
    db.meta.zoneVersions = {};
  }
  db.meta.zoneVersions[zoneId] = (db.meta.zoneVersions[zoneId] ?? 0) + 1;
}
