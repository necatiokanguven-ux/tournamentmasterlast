import {
  dealerDisplayName,
  type DealerStaff,
  type OperatorCoverageAlert,
  type OperatorAlertType,
  type TableRef,
} from "../server/dealerRotation/types";
import { getDisplayDealerForTable } from "./dealerTimeUtils";
import { isRotationDealer } from "./staffRoles";

/** D/T target: 5 dealers per 4 active tables (5/4). */
export const DT_RATIO_DEALERS = 5;
export const DT_RATIO_TABLES = 4;

const TRANSIENT_ALERT_TYPES = new Set<OperatorAlertType>(["ACTION_BLOCKED"]);
const TRANSIENT_ALERT_TTL_MS = 10 * 60_000;

export function requiredDealersForTableCount(activeTableCount: number): number {
  if (activeTableCount <= 0) return 0;
  return Math.ceil((activeTableCount * DT_RATIO_DEALERS) / DT_RATIO_TABLES);
}

export function countActiveRotationDealers(staff: DealerStaff[]): number {
  return staff.filter(s => s.active && isRotationDealer(s) && s.state !== "off_duty").length;
}

/** Same rule as Dealer Control table list (`needsDealer`). */
export function isTableCovered(staff: DealerStaff[], tableId: string, now = Date.now()): boolean {
  return Boolean(getDisplayDealerForTable(staff, tableId, now));
}

export function getUncoveredTables(
  staff: DealerStaff[],
  activeTables: TableRef[],
  now = Date.now(),
): TableRef[] {
  return activeTables.filter(t => !isTableCovered(staff, t.id, now));
}

export type CoverageSummary = {
  activeTableCount: number;
  activeDealerCount: number;
  requiredDealerCount: number;
  staffingRatioOk: boolean;
  dealerShortfall: number;
  uncoveredTableCount: number;
  uncoveredTableNumbers: number[];
  /** Tables with no assigned dealer — immediate action required. */
  hasCriticalAlert: boolean;
  /** D/T dealer pool shortfall — warning only when all tables are covered. */
  hasStaffingWarning: boolean;
};

export function buildCoverageSummary(
  staff: DealerStaff[],
  activeTables: TableRef[],
  now = Date.now(),
): CoverageSummary {
  const activeTableCount = activeTables.length;
  const activeDealerCount = countActiveRotationDealers(staff);
  const requiredDealerCount = requiredDealersForTableCount(activeTableCount);
  const uncovered = getUncoveredTables(staff, activeTables, now);
  const staffingRatioOk = activeDealerCount >= requiredDealerCount;

  return {
    activeTableCount,
    activeDealerCount,
    requiredDealerCount,
    staffingRatioOk,
    dealerShortfall: Math.max(0, requiredDealerCount - activeDealerCount),
    uncoveredTableCount: uncovered.length,
    uncoveredTableNumbers: uncovered.map(t => t.number).sort((a, b) => a - b),
    hasCriticalAlert: uncovered.length > 0,
    hasStaffingWarning: !staffingRatioOk && activeTableCount > 0 && uncovered.length === 0,
  };
}

export function buildLiveCoverageAlerts(
  staff: DealerStaff[],
  activeTables: TableRef[],
  now = Date.now(),
): OperatorCoverageAlert[] {
  const summary = buildCoverageSummary(staff, activeTables, now);
  const createdAt = new Date(now).toISOString();
  const alerts: OperatorCoverageAlert[] = [];

  for (const table of getUncoveredTables(staff, activeTables, now)) {
    alerts.push({
      id: `live-uncovered-${table.id}`,
      type: "UNCOVERED_TABLE",
      severity: "critical",
      message: `Table ${table.number} has no dealer assigned.`,
      tableNumber: table.number,
      dealerId: null,
      dealerName: null,
      createdAt,
    });
  }

  if (summary.hasStaffingWarning) {
    alerts.push({
      id: "live-understaffed-ratio",
      type: "UNDERSTAFFED_RATIO",
      severity: "warning",
      message: `Dealer/Table: ${summary.activeDealerCount}/${summary.activeTableCount} dealers — target ${summary.requiredDealerCount} (5/4). Short ${summary.dealerShortfall} dealer(s).`,
      tableNumber: null,
      dealerId: null,
      dealerName: null,
      createdAt,
    });
  }

  return alerts;
}

/** Dealers still on table after hitting their shift work limit — true overtime only. */
export function buildLiveOvertimeAlerts(
  staff: DealerStaff[],
  now = Date.now(),
): OperatorCoverageAlert[] {
  const createdAt = new Date(now).toISOString();
  const alerts: OperatorCoverageAlert[] = [];

  for (const dealer of staff) {
    if (!dealer.active || !isRotationDealer(dealer)) continue;
    if (dealer.state !== "on_table" || dealer.tableNumber == null) continue;
    if (dealer.totalWorkMinutes < dealer.maxWorkMinutes) continue;

    alerts.push({
      id: `live-overtime-${dealer.id}`,
      type: "OVERTIME_COVERAGE",
      severity: dealer.acceptsOvertime ? "warning" : "critical",
      message: `${dealerDisplayName(dealer)} on Table ${dealer.tableNumber} — shift limit reached, still dealing until relieved`,
      tableNumber: dealer.tableNumber,
      dealerId: dealer.id,
      dealerName: dealerDisplayName(dealer),
      createdAt,
    });
  }

  return alerts;
}

export function mergeCoverageAlerts(
  existing: OperatorCoverageAlert[],
  staff: DealerStaff[],
  activeTables: TableRef[],
  now = Date.now(),
): OperatorCoverageAlert[] {
  const transient = existing.filter(
    a => TRANSIENT_ALERT_TYPES.has(a.type)
      && now - new Date(a.createdAt).getTime() < TRANSIENT_ALERT_TTL_MS,
  );
  return [
    ...transient,
    ...buildLiveCoverageAlerts(staff, activeTables, now),
    ...buildLiveOvertimeAlerts(staff, now),
  ];
}
