import type { Table, TournamentSettings } from "../../types";
import type { DealerRotationData, DealerStaff } from "./types";

export type DealerZone = {
  id: string;
  name: string;
  tableNumbers: number[];
};

export function isDealerZonesEnabled(): boolean {
  return process.env.DEALER_ZONES === "true";
}

export function getDealerZones(settings: Pick<TournamentSettings, "dealerZones">): DealerZone[] {
  return settings.dealerZones ?? [];
}

export function resolveZoneIdForTableNumber(zones: DealerZone[], tableNumber: number): string | null {
  for (const zone of zones) {
    if (zone.tableNumbers.includes(tableNumber)) return zone.id;
  }
  return null;
}

export function resolveZoneFromQuery(value: unknown): string | null {
  const zoneId = String(value ?? "").trim();
  return zoneId || null;
}

export function filterTablesForZone(tables: Table[], zoneId: string | null, zones: DealerZone[]): Table[] {
  if (!isDealerZonesEnabled() || !zoneId) return tables;
  const zone = zones.find(entry => entry.id === zoneId);
  if (!zone) return [];
  const numbers = new Set(zone.tableNumbers);
  return tables.filter(table => numbers.has(table.number));
}

export function filterStaffForZone(
  staff: DealerStaff[],
  zoneId: string | null,
  zoneTableNumbers: Set<number>,
): DealerStaff[] {
  if (!isDealerZonesEnabled() || !zoneId) return staff;
  return staff.filter(member =>
    member.zoneId === zoneId
    || (member.tableNumber != null && zoneTableNumbers.has(member.tableNumber)),
  );
}

export function filterRotationForZone(
  rotation: DealerRotationData,
  zoneId: string | null,
  zoneTableNumbers: Set<number>,
): DealerRotationData {
  if (!isDealerZonesEnabled() || !zoneId) return rotation;

  const staff = filterStaffForZone(rotation.staff, zoneId, zoneTableNumbers);
  const staffIds = new Set(staff.map(member => member.id));

  return {
    ...rotation,
    staff,
    poolQueue: rotation.poolQueue.filter(id => staffIds.has(id)),
    waitingList: rotation.waitingList.filter(id => staffIds.has(id)),
    notifications: rotation.notifications.filter(note => staffIds.has(note.dealerId)),
    operatorAlerts: rotation.operatorAlerts ?? [],
  };
}

export function buildTableZoneMap(zones: DealerZone[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const zone of zones) {
    for (const tableNumber of zone.tableNumbers) {
      map.set(tableNumber, zone.id);
    }
  }
  return map;
}
