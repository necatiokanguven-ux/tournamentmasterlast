export type DealerRotationState =
  | "off_duty"
  | "pool"
  | "on_table"
  | "on_break"
  | "ready"
  | "standby"
  | "waiting"
  | "incoming";

export interface DealerStaff {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  maxWorkMinutes: number;
  totalWorkMinutes: number;
  acceptsOvertime: boolean;
  active: boolean;
  state: DealerRotationState;
  tableId: string | null;
  tableNumber: number | null;
  dealEndAt: string | null;
  breakEndAt: string | null;
  sessionStartedAt: string | null;
  /** When the current table stint started (resets on each push/assign). */
  dealStartedAt: string | null;
  /** When the current break stint started. */
  breakStartedAt: string | null;
  /** Incoming dealer tapped "I'm going" on phone. */
  assignmentAckAt: string | null;
  /** Outgoing dealer acknowledged rotation-end notice. */
  releaseAckAt: string | null;
  /** Last operator/system duty change — phone must ack to match. */
  lastDutyChangeAt: string | null;
  /** Dealer acknowledged current duty on phone. */
  dutyAckAt: string | null;
  /** Operator sent an urgent room call (overrides break/waiting UI). */
  emergencyCallAt: string | null;
  /** Dealer acknowledged the urgent room call on phone. */
  emergencyAckAt: string | null;
  /** Accumulated deal seconds this session (excludes live stint — use helpers for live total). */
  sessionDealSeconds: number;
  /** Accumulated break seconds this session. */
  sessionBreakSeconds: number;
  /** Job role — only "dealer" receives table rotation. */
  role: string;
  /** Support staff shift tracking (non-dealer roles). */
  shiftActive: boolean;
  shiftStartedAt: string | null;
  sessionStaffSeconds: number;
  totalStaffMinutes: number;
  /** Phase 5G — phone session + grace recovery */
  phoneSessionToken: string | null;
  phoneDeviceId: string | null;
  phoneLastSeenAt: string | null;
  phoneGraceUntil: string | null;
  stateBeforeDisconnect: DealerRotationState | null;
  /** Phase 6 — dealer zone assignment (null = unassigned). */
  zoneId: string | null;
}

export type OperatorAlertType =
  | "UNCOVERED_TABLE"
  | "UNDERSTAFFED_RATIO"
  | "OVERTIME_COVERAGE"
  | "ACTION_BLOCKED";

export interface OperatorCoverageAlert {
  id: string;
  type: OperatorAlertType;
  severity: "critical" | "warning";
  message: string;
  tableNumber: number | null;
  dealerId: string | null;
  dealerName: string | null;
  createdAt: string;
}

export interface DealerRotationSettings {
  enabled: boolean;
  tDealMinutes: number;
  tBreakMinutes: number;
  autoAssign: boolean;
  lastBreakLevelIndex: number | null;
  /** Set while tournament clock is on a structure break level. */
  activeTournamentBreakLevelIndex: number | null;
  /** Custom staff role labels added via roster. */
  customStaffRoles: string[];
  /** When true, T_deal handoffs are paused — dealers stay on assigned tables. */
  handoffFrozen: boolean;
  /** Prefer dealers with fewer totalWorkMinutes when assigning from pool. */
  workHourAwareAssign: boolean;
  /** Level 1 distribute: assign tables to dealers with the least hours first. */
  level1FairOrder: boolean;
}

export type CoverageActionResult = {
  ok: boolean;
  error?: string;
};

export type DealerWorkLogEvent =
  | "assigned"
  | "released"
  | "break_start"
  | "break_end"
  | "manual_move"
  | "overtime"
  | "logged_out"
  | "level1_reset"
  | "check_in"
  | "ack_assignment"
  | "confirmed_arrival";

export interface DealerWorkLogEntry {
  id: string;
  dealerId: string;
  dealerName: string;
  event: DealerWorkLogEvent;
  tableNumber: number | null;
  timestamp: string;
  minutesWorked?: number;
  note?: string;
}

export type DealerNotificationType =
  | "ASSIGN_TABLE"
  | "END_SHIFT_AT_TABLE"
  | "GO_ON_BREAK"
  | "STANDBY_READY"
  | "TABLE_CLOSED"
  | "MANUAL_ASSIGN"
  | "CONFIRM_ARRIVAL"
  | "MOVED_TO_WAITING"
  | "MOVED_TO_POOL"
  | "EMERGENCY_CALL"
  | "TOURNAMENT_BREAK";

export interface DealerNotification {
  id: string;
  dealerId: string;
  type: DealerNotificationType;
  message: string;
  tableNumber: number | null;
  createdAt: string;
  readAt: string | null;
}

export interface DealerRotationData {
  settings: DealerRotationSettings;
  staff: DealerStaff[];
  poolQueue: string[];
  waitingList: string[];
  workLog: DealerWorkLogEntry[];
  notifications: DealerNotification[];
  /** Operator-facing coverage and staffing alerts. */
  operatorAlerts: OperatorCoverageAlert[];
  /** Fingerprints of warnings dismissed by the operator (see dealerAlertSilencing). */
  dismissedOperatorAlertKeys: string[];
}

export interface TableRef {
  id: string;
  number: number;
}

export const DEFAULT_DEALER_ROTATION: DealerRotationData = {
  settings: {
    enabled: false,
    tDealMinutes: 30,
    tBreakMinutes: 30,
    autoAssign: true,
    lastBreakLevelIndex: null,
    activeTournamentBreakLevelIndex: null,
    customStaffRoles: [],
    handoffFrozen: false,
    workHourAwareAssign: true,
    level1FairOrder: true,
  },
  staff: [],
  poolQueue: [],
  waitingList: [],
  workLog: [],
  notifications: [],
  operatorAlerts: [],
  dismissedOperatorAlertKeys: [],
};

export function normalizeDealerRotation(raw: Partial<DealerRotationData> | undefined): DealerRotationData {
  if (!raw) {
    return {
      ...DEFAULT_DEALER_ROTATION,
      settings: { ...DEFAULT_DEALER_ROTATION.settings },
      staff: [],
      poolQueue: [],
      waitingList: [],
      workLog: [],
      notifications: [],
      operatorAlerts: [],
      dismissedOperatorAlertKeys: [],
    };
  }

  return {
    settings: {
      enabled: raw.settings?.enabled ?? DEFAULT_DEALER_ROTATION.settings.enabled,
      tDealMinutes: raw.settings?.tDealMinutes ?? DEFAULT_DEALER_ROTATION.settings.tDealMinutes,
      tBreakMinutes: raw.settings?.tBreakMinutes ?? DEFAULT_DEALER_ROTATION.settings.tBreakMinutes,
      autoAssign: raw.settings?.autoAssign ?? DEFAULT_DEALER_ROTATION.settings.autoAssign,
      lastBreakLevelIndex: raw.settings?.lastBreakLevelIndex ?? null,
      activeTournamentBreakLevelIndex: raw.settings?.activeTournamentBreakLevelIndex ?? null,
      customStaffRoles: Array.isArray(raw.settings?.customStaffRoles)
        ? [...raw.settings.customStaffRoles]
        : [],
      handoffFrozen: raw.settings?.handoffFrozen ?? false,
      workHourAwareAssign: raw.settings?.workHourAwareAssign ?? DEFAULT_DEALER_ROTATION.settings.workHourAwareAssign,
      level1FairOrder: raw.settings?.level1FairOrder ?? DEFAULT_DEALER_ROTATION.settings.level1FairOrder,
    },
    staff: Array.isArray(raw.staff)
      ? raw.staff.map(s => ({
          ...s,
          role: s.role ?? "dealer",
          shiftActive: s.shiftActive ?? false,
          shiftStartedAt: s.shiftStartedAt ?? null,
          sessionStaffSeconds: s.sessionStaffSeconds ?? 0,
          totalStaffMinutes: s.totalStaffMinutes ?? 0,
          dealStartedAt: s.dealStartedAt ?? null,
          breakStartedAt: s.breakStartedAt ?? null,
          assignmentAckAt: s.assignmentAckAt ?? null,
          releaseAckAt: s.releaseAckAt ?? null,
          lastDutyChangeAt: s.lastDutyChangeAt ?? null,
          dutyAckAt: s.dutyAckAt ?? null,
          emergencyCallAt: s.emergencyCallAt ?? null,
          emergencyAckAt: s.emergencyAckAt ?? null,
          sessionDealSeconds: s.sessionDealSeconds ?? 0,
          sessionBreakSeconds: s.sessionBreakSeconds ?? 0,
          phoneSessionToken: s.phoneSessionToken ?? null,
          phoneDeviceId: s.phoneDeviceId ?? null,
          phoneLastSeenAt: s.phoneLastSeenAt ?? null,
          phoneGraceUntil: s.phoneGraceUntil ?? null,
          stateBeforeDisconnect: s.stateBeforeDisconnect ?? null,
          zoneId: s.zoneId ?? null,
        }))
      : [],
    poolQueue: Array.isArray(raw.poolQueue) ? [...raw.poolQueue] : [],
    waitingList: Array.isArray(raw.waitingList) ? [...raw.waitingList] : [],
    workLog: Array.isArray(raw.workLog) ? raw.workLog.map(e => ({ ...e })) : [],
    notifications: Array.isArray(raw.notifications) ? raw.notifications.map(n => ({ ...n })) : [],
    operatorAlerts: Array.isArray(raw.operatorAlerts) ? raw.operatorAlerts.map(a => ({ ...a })) : [],
    dismissedOperatorAlertKeys: Array.isArray(raw.dismissedOperatorAlertKeys)
      ? [...raw.dismissedOperatorAlertKeys]
      : [],
  };
}

export function dealerDisplayName(staff: Pick<DealerStaff, "firstName" | "lastName">): string {
  return `${staff.firstName} ${staff.lastName}`.trim();
}
