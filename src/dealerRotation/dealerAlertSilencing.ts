import type { OperatorAlertType, OperatorCoverageAlert } from "../server/dealerRotation/types";

/** Non-critical warnings the operator may dismiss while the condition persists. */
export const DISMISSIBLE_ALERT_TYPES = new Set<OperatorAlertType>([
  "UNDERSTAFFED_RATIO",
  "OVERTIME_COVERAGE",
  "ACTION_BLOCKED",
]);

export const DEAL_BEFORE_BREAK_DISMISS_KEY = "STATIC:DEAL_BEFORE_BREAK";

export function operatorAlertFingerprint(
  alert: Pick<OperatorCoverageAlert, "type" | "tableNumber" | "dealerId">,
): string {
  return `${alert.type}:${alert.tableNumber ?? "x"}:${alert.dealerId ?? "x"}`;
}

export function isAlertDismissible(
  alert: Pick<OperatorCoverageAlert, "type">,
): boolean {
  return DISMISSIBLE_ALERT_TYPES.has(alert.type);
}

/** Hide operator-dismissed warnings. Critical uncovered-table alerts are never silenced. */
export function applyDismissedOperatorAlerts(
  alerts: OperatorCoverageAlert[],
  dismissedKeys: string[],
): OperatorCoverageAlert[] {
  if (dismissedKeys.length === 0) return alerts;
  const dismissed = new Set(dismissedKeys);
  return alerts.filter(alert => {
    if (alert.type === "UNCOVERED_TABLE") return true;
    return !dismissed.has(operatorAlertFingerprint(alert));
  });
}

/** Drop dismiss keys when the underlying condition cleared so the next occurrence can alert again. */
export function pruneDismissedOperatorAlertKeys(
  dismissedKeys: string[],
  liveAlerts: OperatorCoverageAlert[],
): string[] {
  if (dismissedKeys.length === 0) return dismissedKeys;
  const liveKeys = new Set(liveAlerts.map(operatorAlertFingerprint));

  return dismissedKeys.filter(key => {
    if (key === DEAL_BEFORE_BREAK_DISMISS_KEY) return true;
    return liveKeys.has(key);
  });
}

export function isDealBeforeBreakDismissed(dismissedKeys: string[]): boolean {
  return dismissedKeys.includes(DEAL_BEFORE_BREAK_DISMISS_KEY);
}
