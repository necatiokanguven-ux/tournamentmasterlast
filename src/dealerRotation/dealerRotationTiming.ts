/** Work-before-break above this threshold is shown as critical (red). */
export const CRITICAL_WORK_BEFORE_BREAK_MINUTES = 60;

export type RotationTimingInsight = {
  tableCount: number;
  dealerCount: number;
  requiredDealerCount: number;
  spareDealers: number;
  dealerStaffingLabel: string;
  dealerStaffingSufficient: boolean;
  dealStintMinutes: number;
  breakStintMinutes: number;
  /** Estimated continuous dealing before a dealer can take break. */
  workMinutesBeforeBreak: number;
  workBeforeBreakOk: boolean;
  /** One full table rotation wave (all M tables). */
  fullCycleMinutes: number;
};

export function computeRotationTimingInsight(params: {
  tableCount: number;
  dealerCount: number;
  requiredDealerCount: number;
  tDealMinutes: number;
  tBreakMinutes: number;
}): RotationTimingInsight {
  const M = params.tableCount;
  const D = params.dealerCount;
  const tDeal = params.tDealMinutes;
  const tBreak = params.tBreakMinutes;
  const spareDealers = Math.max(0, D - M);

  let workMinutesBeforeBreak = 0;
  if (M > 0 && D > 0) {
    if (D > M) {
      workMinutesBeforeBreak = tDeal;
    } else {
      workMinutesBeforeBreak = M * tDeal;
    }
  }

  let dealerStaffingLabel: string;
  let dealerStaffingSufficient: boolean;
  if (M === 0) {
    dealerStaffingLabel = "No active tables";
    dealerStaffingSufficient = true;
  } else if (D < M) {
    dealerStaffingLabel = `Dealer short (${M - D} for table coverage)`;
    dealerStaffingSufficient = false;
  } else if (D >= params.requiredDealerCount) {
    dealerStaffingLabel = "Dealer count sufficient";
    dealerStaffingSufficient = true;
  } else {
    dealerStaffingLabel = `Dealer short (${params.requiredDealerCount - D} for Dealer/Table)`;
    dealerStaffingSufficient = false;
  }

  return {
    tableCount: M,
    dealerCount: D,
    requiredDealerCount: params.requiredDealerCount,
    spareDealers,
    dealerStaffingLabel,
    dealerStaffingSufficient,
    dealStintMinutes: tDeal,
    breakStintMinutes: tBreak,
    workMinutesBeforeBreak,
    workBeforeBreakOk: workMinutesBeforeBreak <= CRITICAL_WORK_BEFORE_BREAK_MINUTES,
    fullCycleMinutes: M > 0 ? M * tDeal : 0,
  };
}

export type DealerControlStatusLevel = "ok" | "warning" | "critical";

export function resolveDealerControlStatusLevel(input: {
  enabled: boolean;
  hasCriticalAlert: boolean;
  hasStaffingWarning: boolean;
  hasTransientAlert: boolean;
  workBeforeBreakOk: boolean;
  tableCount: number;
}): DealerControlStatusLevel {
  if (!input.enabled || input.tableCount === 0) return "ok";
  if (input.hasCriticalAlert) return "critical";
  if (input.hasStaffingWarning || input.hasTransientAlert || !input.workBeforeBreakOk) return "warning";
  return "ok";
}
