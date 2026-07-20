import type { TournamentDatabase } from "../tournamentDatabase";
import { activeTablesFromDb, getTournamentBreakStatus } from "../dealerRotation/RotationTriggerService";
import { buildCoverageSummary } from "../../dealerRotation/dealerCoverageUtils";
import {
  filterRotationForZone,
  filterTablesForZone,
  getDealerZones,
  isDealerZonesEnabled,
} from "../dealerRotation/dealerZoneUtils";
import { getZoneVersion } from "../dealerRotation/zoneLock";
import {
  getCurrentTableDealSeconds,
  getDealRemainingSeconds,
  getDisplayDealerForTable,
  getSessionBreakSeconds,
  getSessionDealSeconds,
} from "../../dealerRotation/dealerTimeUtils";
import { dealerDisplayName } from "../dealerRotation/types";

export type DealerControlChannelPayload = {
  version: number;
  zoneId: string | null;
  zoneVersion: number;
  rotation: TournamentDatabase["dealerRotation"];
  tables: Array<{
    id: string;
    number: number;
    dealerId: string | null;
    dealerName: string | null;
    dealerState: string | null;
    currentTableDealSeconds: number;
    rotationRemainingSeconds: number | null;
    needsDealer: boolean;
  }>;
  staffTiming: Array<{
    id: string;
    sessionDealSeconds: number;
    sessionBreakSeconds: number;
    currentTableDealSeconds: number;
  }>;
  serverTime: number;
  coverageSummary: ReturnType<typeof buildCoverageSummary>;
  tournamentBreak: ReturnType<typeof getTournamentBreakStatus>;
};

export function parseDealerControlChannel(channel: string): string | null {
  if (channel === "dealer-control") return null;
  const match = channel.match(/^dealer-control:(.+)$/);
  return match?.[1]?.trim() || null;
}

export function buildDealerControlStatePayload(
  db: TournamentDatabase,
  zoneId: string | null = null,
): DealerControlChannelPayload {
  const now = Date.now();
  const zones = getDealerZones(db.settings);
  const zone = zoneId ? zones.find(entry => entry.id === zoneId) : null;
  const zoneTableNumbers = new Set(zone?.tableNumbers ?? []);
  const scopedTables = filterTablesForZone(db.tables, zoneId, zones);
  const scopedRotation = filterRotationForZone(db.dealerRotation, zoneId, zoneTableNumbers);
  const { settings } = scopedRotation;
  const activeTables = activeTablesFromDb(scopedTables);

  const tables = scopedTables.map(table => {
    const dealer = getDisplayDealerForTable(scopedRotation.staff, table.id, now);
    return {
      id: table.id,
      number: table.number,
      dealerId: dealer?.id ?? null,
      dealerName: dealer ? dealerDisplayName(dealer) : null,
      dealerState: dealer?.state ?? null,
      currentTableDealSeconds: dealer ? getCurrentTableDealSeconds(dealer, now, settings) : 0,
      rotationRemainingSeconds: dealer ? getDealRemainingSeconds(dealer, now) : null,
      needsDealer: scopedRotation.settings.enabled && !dealer,
    };
  });

  const staffTiming = scopedRotation.staff.map(dealer => ({
    id: dealer.id,
    sessionDealSeconds: getSessionDealSeconds(dealer, now, settings),
    sessionBreakSeconds: getSessionBreakSeconds(dealer, now, settings),
    currentTableDealSeconds: getCurrentTableDealSeconds(dealer, now, settings),
  }));

  return {
    version: db.meta.lastModified,
    zoneId: isDealerZonesEnabled() ? zoneId : null,
    zoneVersion: zoneId ? getZoneVersion(db, zoneId) : 0,
    rotation: scopedRotation,
    tables,
    staffTiming,
    serverTime: now,
    coverageSummary: buildCoverageSummary(scopedRotation.staff, activeTables, now),
    tournamentBreak: getTournamentBreakStatus(db.settings, db.clock, now),
  };
}
