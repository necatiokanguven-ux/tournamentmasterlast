import {
  dealerDisplayName,
  DEFAULT_DEALER_ROTATION,
  type CoverageActionResult,
  type DealerNotification,
  type DealerNotificationType,
  type DealerRotationData,
  type DealerRotationSettings,
  type DealerRotationState,
  type DealerStaff,
  type DealerWorkLogEntry,
  type DealerWorkLogEvent,
  type OperatorAlertType,
  type OperatorCoverageAlert,
  type TableRef,
} from "./types";
import { isDealerInPhoneGrace } from "./phoneGrace";
import { repairDealerTimingFields, isDealStintExpired } from "../../dealerRotation/dealerTimeUtils";
import {
  mergeCoverageAlerts,
} from "../../dealerRotation/dealerCoverageUtils";
import {
  applyDismissedOperatorAlerts,
  pruneDismissedOperatorAlertKeys,
} from "../../dealerRotation/dealerAlertSilencing";
import { isRotationDealer } from "../../dealerRotation/staffRoles";
import {
  pickDealerIdWithLeastWork,
  sortDealersForLevelOne,
} from "../../dealerRotation/dealerAssignmentFairness";
import { buildTableZoneMap, type DealerZone } from "./dealerZoneUtils";

function nowIso(now: Date): string {
  return now.toISOString();
}

function addMinutes(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Grace period before auto-completing a handoff when replacement has not confirmed on phone. */
const HANDOFF_CONFIRM_GRACE_MS = 3 * 60_000;

export type RotationEngineResult = {
  data: DealerRotationData;
  notifications: DealerNotification[];
};

export class DealerQueueManager {
  private data: DealerRotationData;
  private pendingNotifications: DealerNotification[] = [];
  private zonesEnabled = false;
  private tableZoneByNumber = new Map<number, string>();

  constructor(snapshot: DealerRotationData) {
    this.data = structuredClone(snapshot);
  }

  configureZones(enabled: boolean, zones: DealerZone[]): void {
    this.zonesEnabled = enabled;
    this.tableZoneByNumber = enabled ? buildTableZoneMap(zones) : new Map();
  }

  private zoneIdForTable(table: TableRef): string | null {
    if (!this.zonesEnabled) return null;
    return this.tableZoneByNumber.get(table.number) ?? null;
  }

  private dealerMatchesZone(dealer: DealerStaff, zoneId: string | null): boolean {
    if (!this.zonesEnabled || !zoneId) return true;
    if (dealer.zoneId === zoneId) return true;
    if (dealer.tableNumber != null) {
      return this.tableZoneByNumber.get(dealer.tableNumber) === zoneId;
    }
    return false;
  }

  private filterDealerIdsForZone(dealerIds: string[], zoneId: string | null): string[] {
    if (!this.zonesEnabled || !zoneId) return dealerIds;
    return dealerIds.filter(id => {
      const staff = this.getStaff(id);
      return staff ? this.dealerMatchesZone(staff, zoneId) : false;
    });
  }

  export(): DealerRotationData {
    return structuredClone(this.data);
  }

  drainNotifications(): DealerNotification[] {
    const out = [...this.pendingNotifications];
    this.pendingNotifications = [];
    return out;
  }

  getSettings(): DealerRotationSettings {
    return { ...this.data.settings };
  }

  updateSettings(partial: Partial<DealerRotationSettings>): void {
    const patch = Object.fromEntries(
      Object.entries(partial).filter(([, value]) => value !== undefined),
    ) as Partial<DealerRotationSettings>;
    this.data.settings = { ...this.data.settings, ...patch };
  }

  private getStaff(dealerId: string): DealerStaff | undefined {
    return this.data.staff.find(s => s.id === dealerId);
  }

  private pushNotification(
    dealerId: string,
    type: DealerNotificationType,
    message: string,
    tableNumber: number | null = null,
    now = new Date(),
  ): void {
    this.pendingNotifications.push({
      id: createId("dn"),
      dealerId,
      type,
      message,
      tableNumber,
      createdAt: nowIso(now),
      readAt: null,
    });
  }

  private logWork(
    dealer: DealerStaff,
    event: DealerWorkLogEvent,
    tableNumber: number | null,
    now: Date,
    extra?: { minutesWorked?: number; note?: string },
  ): void {
    this.data.workLog.push({
      id: createId("dwl"),
      dealerId: dealer.id,
      dealerName: dealerDisplayName(dealer),
      event,
      tableNumber,
      timestamp: nowIso(now),
      minutesWorked: extra?.minutesWorked,
      note: extra?.note,
    });
    if (this.data.workLog.length > 500) {
      this.data.workLog = this.data.workLog.slice(-500);
    }
  }

  private removeFromQueues(dealerId: string): void {
    this.data.poolQueue = this.data.poolQueue.filter(id => id !== dealerId);
    this.data.waitingList = this.data.waitingList.filter(id => id !== dealerId);
  }

  private setState(dealer: DealerStaff, state: DealerRotationState): void {
    dealer.state = state;
  }

  private canWork(dealer: DealerStaff, options?: { allowOvertime?: boolean }): boolean {
    if (!dealer.active) return false;
    if (dealer.totalWorkMinutes >= dealer.maxWorkMinutes) {
      return Boolean(options?.allowOvertime);
    }
    return true;
  }

  private pushOperatorAlert(
    type: OperatorAlertType,
    severity: OperatorCoverageAlert["severity"],
    message: string,
    now: Date,
    extra?: { tableNumber?: number | null; dealer?: DealerStaff | null },
  ): void {
    const alert: OperatorCoverageAlert = {
      id: createId("oa"),
      type,
      severity,
      message,
      tableNumber: extra?.tableNumber ?? null,
      dealerId: extra?.dealer?.id ?? null,
      dealerName: extra?.dealer ? dealerDisplayName(extra.dealer) : null,
      createdAt: nowIso(now),
    };
    this.data.operatorAlerts.unshift(alert);
    if (this.data.operatorAlerts.length > 40) {
      this.data.operatorAlerts = this.data.operatorAlerts.slice(0, 40);
    }
  }

  private isSoleTableCoverage(dealerId: string, tableId: string): boolean {
    const covering = this.data.staff.filter(
      s => s.tableId === tableId && (s.state === "on_table" || s.state === "incoming" || s.state === "waiting"),
    );
    return covering.length === 1 && covering[0].id === dealerId;
  }

  private pickFromDealerIds(dealerIds: string[]): string | null {
    const eligible = dealerIds.filter(id => {
      const staff = this.getStaff(id);
      return staff && isRotationDealer(staff) && this.canWork(staff);
    });
    if (eligible.length === 0) return null;
    if (!this.data.settings.workHourAwareAssign) {
      return eligible[0];
    }
    return pickDealerIdWithLeastWork(eligible, id => this.getStaff(id), this.data.poolQueue);
  }

  private findAssignableDealerId(excludeId?: string): string | null {
    const standbyIds = this.data.poolQueue.filter(id => {
      if (id === excludeId) return false;
      const staff = this.getStaff(id);
      return staff && isRotationDealer(staff) && staff.state === "standby";
    });
    const standbyPick = this.pickFromDealerIds(standbyIds);
    if (standbyPick) return standbyPick;

    const readyIds = this.data.poolQueue.filter(id => {
      if (id === excludeId) return false;
      const staff = this.getStaff(id);
      return staff && isRotationDealer(staff) && staff.state === "ready";
    });
    const readyPick = this.pickFromDealerIds(readyIds);
    if (readyPick) return readyPick;

    const waitingIds = this.data.waitingList.filter(id => {
      if (id === excludeId) return false;
      const staff = this.getStaff(id);
      return staff && isRotationDealer(staff) && (staff.state === "waiting" || staff.state === "ready");
    });
    return this.pickFromDealerIds(waitingIds);
  }

  private assignIncomingReplacement(dealerId: string, table: TableRef, now: Date, reason: string): boolean {
    const incoming = this.getStaff(dealerId);
    if (!incoming || !isRotationDealer(incoming) || !this.canWork(incoming)) return false;

    this.removeFromQueues(dealerId);
    this.flushBreakTime(incoming, now);
    incoming.tableId = table.id;
    incoming.tableNumber = table.number;
    incoming.dealEndAt = null;
    incoming.assignmentAckAt = null;
    this.beginTableStint(incoming, now);
    this.setState(incoming, "incoming");
    this.markDutyChange(incoming, now);
    this.logWork(incoming, "assigned", table.number, now, { note: reason });
    this.pushNotification(
      incoming.id,
      "ASSIGN_TABLE",
      `Table ${table.number} assignment. Tap I'M GOING on your phone.`,
      table.number,
      now,
    );
    return true;
  }

  private tryAssignReplacementToTable(
    table: TableRef,
    now: Date,
    reason: string,
    excludeId?: string,
  ): string | null {
    const assignId = this.findAssignableDealerId(excludeId);
    if (!assignId) return null;

    if (!this.getDealerOnTable(table.id)) {
      return this.assignToTableInternal(assignId, table, now, reason, true) ? assignId : null;
    }

    if (excludeId && this.isSoleTableCoverage(excludeId, table.id)) {
      return this.assignIncomingReplacement(assignId, table, now, reason) ? assignId : null;
    }

    return null;
  }

  /** Renew deal stint without handoff — normal when no standby is available. */
  private renewDealStint(dealer: DealerStaff, table: TableRef, now: Date, note: string): void {
    this.flushDealTime(dealer, now);
    this.beginTableStint(dealer, now);
    dealer.dealEndAt = addMinutes(now, this.data.settings.tDealMinutes);
    this.setState(dealer, "on_table");
    dealer.releaseAckAt = null;
    this.logWork(dealer, "assigned", table.number, now, { note });
  }

  /** Shift-limit overtime — dealer must stay on table with no replacement. Alerts operator. */
  private extendDealForCoverage(dealer: DealerStaff, table: TableRef, now: Date, note: string): void {
    this.flushDealTime(dealer, now);
    this.beginTableStint(dealer, now);
    dealer.dealEndAt = addMinutes(now, this.data.settings.tDealMinutes);
    if (dealer.state === "incoming") {
      this.setState(dealer, "on_table");
      dealer.releaseAckAt = null;
    }
    this.logWork(dealer, "overtime", table.number, now, { note });
    this.pushOperatorAlert(
      "OVERTIME_COVERAGE",
      dealer.acceptsOvertime ? "warning" : "critical",
      `${dealerDisplayName(dealer)} on Table ${table.number} — ${note}`,
      now,
      { tableNumber: table.number, dealer },
    );
  }

  private secureCoverageBeforeTableRelease(
    dealer: DealerStaff,
    activeTables: TableRef[],
    now: Date,
    actionLabel: string,
  ): CoverageActionResult {
    if (!dealer.tableId) return { ok: true };

    const table = activeTables.find(t => t.id === dealer.tableId);
    if (!table) return { ok: true };

    if (!this.isSoleTableCoverage(dealer.id, table.id)) {
      return { ok: true };
    }

    const replacementId = this.tryAssignReplacementToTable(table, now, `pre_${actionLabel}`, dealer.id);
    if (replacementId) {
      return { ok: true };
    }

    this.pushOperatorAlert(
      "ACTION_BLOCKED",
      "warning",
      `Cannot ${actionLabel} ${dealerDisplayName(dealer)} — Table ${table.number} must stay covered. Assign a replacement first.`,
      now,
      { tableNumber: table.number, dealer },
    );
    return {
      ok: false,
      error: `Table ${table.number} cannot be left without a dealer. Assign a replacement before ${actionLabel} ${dealerDisplayName(dealer)}.`,
    };
  }

  refreshCoverageAlerts(activeTables: TableRef[], now = new Date()): void {
    if (!this.data.settings.enabled) {
      this.data.operatorAlerts = [];
      return;
    }
    if (this.data.settings.activeTournamentBreakLevelIndex !== null) {
      this.data.operatorAlerts = this.data.operatorAlerts.filter(
        a => a.type === "ACTION_BLOCKED",
      );
      return;
    }

    const merged = mergeCoverageAlerts(
      this.data.operatorAlerts,
      this.data.staff,
      activeTables,
      now.getTime(),
    );

    if (!Array.isArray(this.data.dismissedOperatorAlertKeys)) {
      this.data.dismissedOperatorAlertKeys = [];
    }
    this.data.dismissedOperatorAlertKeys = pruneDismissedOperatorAlertKeys(
      this.data.dismissedOperatorAlertKeys,
      merged,
    );
    this.data.operatorAlerts = applyDismissedOperatorAlerts(
      merged,
      this.data.dismissedOperatorAlertKeys,
    );
  }

  dismissOperatorAlert(fingerprint: string): void {
    if (!Array.isArray(this.data.dismissedOperatorAlertKeys)) {
      this.data.dismissedOperatorAlertKeys = [];
    }
    if (!this.data.dismissedOperatorAlertKeys.includes(fingerprint)) {
      this.data.dismissedOperatorAlertKeys.push(fingerprint);
    }
  }

  private logoutDealer(dealer: DealerStaff, now: Date, reason: string): void {
    this.flushDealTime(dealer, now);
    this.flushBreakTime(dealer, now);
    this.clearTableAssignment(dealer);
    this.removeFromQueues(dealer.id);
    this.setState(dealer, "off_duty");
    this.logWork(dealer, "logged_out", null, now, { note: reason });
    this.pushNotification(dealer.id, "GO_ON_BREAK", `Shift ended: ${reason}`, null, now);
  }

  private clearTableAssignment(dealer: DealerStaff, now?: Date): void {
    if (now) this.flushDealTime(dealer, now);
    dealer.tableId = null;
    dealer.tableNumber = null;
    dealer.dealEndAt = null;
    dealer.dealStartedAt = null;
    dealer.assignmentAckAt = null;
    dealer.releaseAckAt = null;
  }

  private markDutyChange(dealer: DealerStaff, now: Date): void {
    dealer.lastDutyChangeAt = nowIso(now);
    dealer.dutyAckAt = null;
  }

  /** Break duties are accepted automatically — no dealer phone confirmation. */
  private autoAckBreakDuty(dealer: DealerStaff, now: Date): void {
    if (dealer.state !== "on_break") return;

    const ackIso = nowIso(now);
    const alreadyAcked =
      dealer.dutyAckAt != null
      && dealer.lastDutyChangeAt != null
      && new Date(dealer.dutyAckAt).getTime() >= new Date(dealer.lastDutyChangeAt).getTime();

    dealer.lastDutyChangeAt = ackIso;
    dealer.dutyAckAt = ackIso;
    this.markNotificationsRead(dealer.id, ["GO_ON_BREAK", "TOURNAMENT_BREAK"], now);

    if (!alreadyAcked) {
      this.logWork(dealer, "ack_assignment", dealer.tableNumber, now, {
        note: "Break duty auto-acknowledged",
      });
    }
  }

  /** Repair dealers already on break who still have a pending duty ack. */
  repairUnackedBreakDuty(now = new Date()): boolean {
    let changed = false;
    for (const dealer of this.data.staff) {
      if (dealer.state !== "on_break") continue;
      const needsAck =
        !dealer.lastDutyChangeAt
        || !dealer.dutyAckAt
        || new Date(dealer.dutyAckAt).getTime() < new Date(dealer.lastDutyChangeAt).getTime();
      if (!needsAck) continue;
      this.autoAckBreakDuty(dealer, now);
      changed = true;
    }
    return changed;
  }

  private markNotificationsRead(dealerId: string, types: DealerNotificationType[], now = new Date()): void {
    for (const note of this.data.notifications) {
      if (note.dealerId === dealerId && types.includes(note.type) && !note.readAt) {
        note.readAt = nowIso(now);
      }
    }
  }

  private flushDealTime(dealer: DealerStaff, now: Date): void {
    if (!dealer.dealStartedAt) return;
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(dealer.dealStartedAt).getTime()) / 1000));
    dealer.sessionDealSeconds = (dealer.sessionDealSeconds ?? 0) + elapsed;
    dealer.dealStartedAt = null;
  }

  private flushBreakTime(dealer: DealerStaff, now: Date): void {
    if (!dealer.breakStartedAt) return;
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(dealer.breakStartedAt).getTime()) / 1000));
    dealer.sessionBreakSeconds = (dealer.sessionBreakSeconds ?? 0) + elapsed;
    dealer.breakStartedAt = null;
  }

  private resetSessionCounters(dealer: DealerStaff, now: Date): void {
    dealer.sessionDealSeconds = 0;
    dealer.sessionBreakSeconds = 0;
    dealer.sessionStartedAt = nowIso(now);
    dealer.dealStartedAt = null;
    dealer.breakStartedAt = null;
  }

  private beginTableStint(dealer: DealerStaff, now: Date): void {
    dealer.dealStartedAt = nowIso(now);
  }

  upsertStaff(input: Omit<DealerStaff, "state" | "tableId" | "tableNumber" | "dealEndAt" | "breakEndAt" | "sessionStartedAt" | "dealStartedAt" | "breakStartedAt" | "assignmentAckAt" | "releaseAckAt" | "lastDutyChangeAt" | "dutyAckAt" | "emergencyCallAt" | "emergencyAckAt" | "sessionDealSeconds" | "sessionBreakSeconds" | "shiftActive" | "shiftStartedAt" | "sessionStaffSeconds" | "totalStaffMinutes" | "totalWorkMinutes" | "phoneSessionToken" | "phoneDeviceId" | "phoneLastSeenAt" | "phoneGraceUntil" | "stateBeforeDisconnect" | "zoneId"> & { totalWorkMinutes?: number; role?: string; zoneId?: string | null }): DealerStaff {
    const role = (input.role ?? "dealer").trim() || "dealer";
    const existing = this.getStaff(input.id);
    if (existing) {
      Object.assign(existing, {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        maxWorkMinutes: input.maxWorkMinutes,
        acceptsOvertime: input.acceptsOvertime,
        active: input.active,
        role,
        totalWorkMinutes: input.totalWorkMinutes ?? existing.totalWorkMinutes,
        zoneId: input.zoneId !== undefined ? input.zoneId : existing.zoneId,
      });
      if (!isRotationDealer(existing)) {
        this.removeFromQueues(existing.id);
        this.clearTableAssignment(existing);
        this.setState(existing, "off_duty");
      }
      return existing;
    }

    const rotationDealer = isRotationDealer({ role });
    const created: DealerStaff = {
      ...input,
      role,
      totalWorkMinutes: input.totalWorkMinutes ?? 0,
      state: rotationDealer ? "pool" : "off_duty",
      tableId: null,
      tableNumber: null,
      dealEndAt: null,
      breakEndAt: null,
      sessionStartedAt: null,
      dealStartedAt: null,
      breakStartedAt: null,
      assignmentAckAt: null,
      releaseAckAt: null,
      lastDutyChangeAt: null,
      dutyAckAt: null,
      emergencyCallAt: null,
      emergencyAckAt: null,
      sessionDealSeconds: 0,
      sessionBreakSeconds: 0,
      shiftActive: false,
      shiftStartedAt: null,
      sessionStaffSeconds: 0,
      totalStaffMinutes: 0,
      phoneSessionToken: null,
      phoneDeviceId: null,
      phoneLastSeenAt: null,
      phoneGraceUntil: null,
      stateBeforeDisconnect: null,
      zoneId: input.zoneId ?? null,
    };
    this.data.staff.push(created);
    if (rotationDealer && !this.data.poolQueue.includes(created.id)) {
      this.data.poolQueue.push(created.id);
    }
    return created;
  }

  registerCustomStaffRole(label: string): void {
    const trimmed = label.trim();
    if (!trimmed || this.data.settings.customStaffRoles.includes(trimmed)) return;
    this.data.settings.customStaffRoles.push(trimmed);
  }

  /** Support staff ON/OFF shift toggle — not used for rotation dealers. */
  setStaffShift(staffId: string, active: boolean, now = new Date()): boolean {
    const staff = this.getStaff(staffId);
    if (!staff || isRotationDealer(staff)) return false;

    if (active) {
      if (staff.shiftActive) return true;
      staff.shiftActive = true;
      staff.shiftStartedAt = nowIso(now);
      this.logWork(staff, "check_in", null, now, { note: `Shift ON · ${staff.role}` });
      return true;
    }

    if (!staff.shiftActive) return true;
    if (staff.shiftStartedAt) {
      const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(staff.shiftStartedAt).getTime()) / 1000));
      staff.sessionStaffSeconds = (staff.sessionStaffSeconds ?? 0) + elapsed;
      staff.totalStaffMinutes = (staff.totalStaffMinutes ?? 0) + Math.floor(elapsed / 60);
    }
    staff.shiftActive = false;
    staff.shiftStartedAt = null;
    this.logWork(staff, "logged_out", null, now, { note: `Shift OFF · ${staff.role}` });
    return true;
  }

  removeStaff(dealerId: string, activeTables: TableRef[], now = new Date()): CoverageActionResult {
    const dealer = this.getStaff(dealerId);
    if (!dealer) return { ok: true };
    if (!isRotationDealer(dealer)) {
      if (dealer.shiftActive) this.setStaffShift(dealerId, false, now);
      this.clearTableAssignment(dealer);
      this.removeFromQueues(dealer.id);
      this.data.staff = this.data.staff.filter(s => s.id !== dealerId);
      this.logWork(dealer, "logged_out", null, now, { note: "Removed from roster" });
      return { ok: true };
    }

    const coverage = this.secureCoverageBeforeTableRelease(dealer, activeTables, now, "remove from roster");
    if (!coverage.ok) return coverage;

    if (dealer.shiftActive) this.setStaffShift(dealerId, false, now);
    this.clearTableAssignment(dealer);
    this.removeFromQueues(dealer.id);
    this.data.staff = this.data.staff.filter(s => s.id !== dealerId);
    this.logWork(dealer, "logged_out", null, now, { note: "Removed from roster" });
    this.fillEmptyTables(activeTables, now, "post_remove");
    return { ok: true };
  }

  /** Level 1 distribution — first M active dealers to tables in order */
  initializeLevelOne(activeTables: TableRef[], now = new Date()): void {
    const tables = [...activeTables].sort((a, b) => a.number - b.number);
    let ordered = this.data.staff.filter(s => s.active && isRotationDealer(s));
    ordered = sortDealersForLevelOne(ordered, this.data.settings.level1FairOrder, this.data.poolQueue);

    for (const dealer of ordered) {
      this.flushDealTime(dealer, now);
      this.flushBreakTime(dealer, now);
      this.clearTableAssignment(dealer);
      this.removeFromQueues(dealer.id);
      if (!this.canWork(dealer)) {
        this.setState(dealer, "off_duty");
        continue;
      }
      this.resetSessionCounters(dealer, now);
      this.setState(dealer, "pool");
      this.data.poolQueue.push(dealer.id);
    }

    for (let i = 0; i < tables.length && i < ordered.length; i++) {
      this.assignToTableInternal(ordered[i].id, tables[i], now, "level1_reset", false);
    }

    this.initializePoolStates(now);
    this.rebalanceStandby();
    this.fillEmptyTables(activeTables, now, "level1_fill");
    this.refreshCoverageAlerts(activeTables, now);
  }

  private initializePoolStates(now: Date): void {
    const inPool = this.data.poolQueue.filter(id => {
      const d = this.getStaff(id);
      return d && d.state !== "on_table";
    });

    if (inPool.length === 0) return;

    if (inPool.length === 1) {
      const d = this.getStaff(inPool[0])!;
      this.setState(d, "standby");
      return;
    }

    const standbyId = this.pickFromDealerIds(inPool) ?? inPool[0];
    this.setState(this.getStaff(standbyId)!, "standby");
    for (const id of inPool) {
      if (id === standbyId) continue;
      this.startBreak(id, now, false);
    }
  }

  rebalanceStandby(): void {
    const poolIds = this.data.poolQueue.filter(id => {
      const d = this.getStaff(id);
      return d && (d.state === "ready" || d.state === "standby" || d.state === "on_break");
    });

    const standbys = poolIds.filter(id => this.getStaff(id)?.state === "standby");
    const readies = poolIds.filter(id => this.getStaff(id)?.state === "ready");

    for (const id of standbys.slice(1)) {
      const d = this.getStaff(id);
      if (d) this.setState(d, "ready");
    }

    if (!poolIds.some(id => this.getStaff(id)?.state === "standby") && readies.length > 0) {
      const standbyId = this.pickFromDealerIds(readies) ?? readies[0];
      this.setState(this.getStaff(standbyId)!, "standby");
    }

    if (poolIds.length === 1) {
      const d = this.getStaff(poolIds[0]);
      if (d && d.state !== "on_break") this.setState(d, "standby");
    }
  }

  private findStandbyId(forZoneId: string | null = null): string | null {
    const standbyIds = this.data.poolQueue.filter(id => {
      const staff = this.getStaff(id);
      return staff && isRotationDealer(staff) && staff.state === "standby";
    });
    return this.pickFromDealerIds(this.filterDealerIdsForZone(standbyIds, forZoneId));
  }

  private findReadyId(forZoneId: string | null = null): string | null {
    const readyPoolIds = this.data.poolQueue.filter(id => {
      const staff = this.getStaff(id);
      return staff && isRotationDealer(staff) && staff.state === "ready";
    });
    const readyPick = this.pickFromDealerIds(this.filterDealerIdsForZone(readyPoolIds, forZoneId));
    if (readyPick) return readyPick;

    const waitingIds = this.data.waitingList.filter(id => {
      const staff = this.getStaff(id);
      return staff && isRotationDealer(staff) && (staff.state === "waiting" || staff.state === "ready");
    });
    return this.pickFromDealerIds(this.filterDealerIdsForZone(waitingIds, forZoneId));
  }

  private getDealerOnTable(tableId: string): DealerStaff | undefined {
    return this.data.staff.find(s => s.tableId === tableId && (s.state === "on_table" || s.state === "incoming" || s.state === "waiting"));
  }

  assignToTableInternal(
    dealerId: string,
    table: TableRef,
    now: Date,
    reason: string,
    notify = true,
  ): boolean {
    const dealer = this.getStaff(dealerId);
    if (!dealer || !isRotationDealer(dealer) || !this.canWork(dealer)) {
      if (dealer && dealer.totalWorkMinutes >= dealer.maxWorkMinutes) {
        this.logoutDealer(dealer, now, "Maximum work time reached");
      }
      return false;
    }

    const tableZoneId = this.zoneIdForTable(table);
    if (this.zonesEnabled && tableZoneId && !this.dealerMatchesZone(dealer, tableZoneId)) {
      return false;
    }

    const existing = this.getDealerOnTable(table.id);
    if (existing && existing.id !== dealerId) {
      if (isDealerInPhoneGrace(existing, now.getTime())) {
        return false;
      }
      this.moveToWaitingUnchecked(existing, now, `Displaced by ${dealerDisplayName(dealer)}`);
    }

    this.removeFromQueues(dealerId);
    this.flushBreakTime(dealer, now);
    this.clearTableAssignment(dealer, now);
    dealer.tableId = table.id;
    dealer.tableNumber = table.number;
    dealer.sessionStartedAt = dealer.sessionStartedAt ?? nowIso(now);
    dealer.assignmentAckAt = null;
    this.beginTableStint(dealer, now);

    if (notify) {
      dealer.dealEndAt = null;
      dealer.releaseAckAt = null;
      this.setState(dealer, "incoming");
      this.markDutyChange(dealer, now);
      this.logWork(dealer, reason === "manual_move" ? "manual_move" : "assigned", table.number, now, {
        note: reason,
      });
      const isManual = reason === "manual_move";
      this.pushNotification(
        dealer.id,
        isManual ? "MANUAL_ASSIGN" : "ASSIGN_TABLE",
        isManual
          ? `Operator assigned you to Table ${table.number}. Tap I'M GOING on your phone.`
          : `Table ${table.number} assignment. Tap I'M GOING on your phone.`,
        table.number,
        now,
      );
    } else {
      dealer.dealEndAt = addMinutes(now, this.data.settings.tDealMinutes);
      this.setState(dealer, "on_table");
      this.logWork(dealer, reason === "manual_move" ? "manual_move" : "assigned", table.number, now, {
        note: reason,
      });
    }
    return true;
  }

  /** Operator manual assign */
  manualAssign(dealerId: string, table: TableRef, now = new Date()): boolean {
    return this.assignToTableInternal(dealerId, table, now, "manual_move", true);
  }

  private moveToWaitingUnchecked(dealer: DealerStaff, now: Date, note: string): void {
    this.flushDealTime(dealer, now);
    this.clearTableAssignment(dealer);
    this.removeFromQueues(dealer.id);
    this.setState(dealer, "waiting");
    this.markDutyChange(dealer, now);
    if (!this.data.waitingList.includes(dealer.id)) {
      this.data.waitingList.push(dealer.id);
    }
    this.logWork(dealer, "released", null, now, { note });
    this.pushNotification(
      dealer.id,
      "MOVED_TO_WAITING",
      "Operator moved you to the waiting list. Go to the dealer lounge.",
      null,
      now,
    );
  }

  moveToWaiting(dealer: DealerStaff, activeTables: TableRef[], now: Date, note: string): CoverageActionResult {
    const coverage = this.secureCoverageBeforeTableRelease(dealer, activeTables, now, "move to waiting");
    if (!coverage.ok) return coverage;

    this.flushDealTime(dealer, now);
    this.clearTableAssignment(dealer);
    this.removeFromQueues(dealer.id);
    this.setState(dealer, "waiting");
    this.markDutyChange(dealer, now);
    if (!this.data.waitingList.includes(dealer.id)) {
      this.data.waitingList.push(dealer.id);
    }
    this.logWork(dealer, "released", null, now, { note });
    this.pushNotification(
      dealer.id,
      "MOVED_TO_WAITING",
      "Operator moved you to the waiting list. Go to the dealer lounge.",
      null,
      now,
    );
    this.fillEmptyTables(activeTables, now, "post_waiting");
    return { ok: true };
  }

  moveToWaitingById(dealerId: string, activeTables: TableRef[], now: Date, note: string): CoverageActionResult {
    const dealer = this.getStaff(dealerId);
    if (dealer && isRotationDealer(dealer)) return this.moveToWaiting(dealer, activeTables, now, note);
    return { ok: true };
  }

  sendToBreak(dealerId: string, activeTables: TableRef[], now = new Date()): CoverageActionResult {
    const dealer = this.getStaff(dealerId);
    if (!dealer || !isRotationDealer(dealer)) return { ok: true };

    const coverage = this.secureCoverageBeforeTableRelease(dealer, activeTables, now, "send to break");
    if (!coverage.ok) return coverage;

    this.flushDealTime(dealer, now);
    this.clearTableAssignment(dealer, now);
    this.removeFromQueues(dealerId);
    this.data.poolQueue.push(dealerId);
    this.startBreak(dealerId, now, true, true);
    this.rebalanceStandby();
    this.fillEmptyTables(activeTables, now, "post_break");
    return { ok: true };
  }

  sendToPool(dealerId: string, activeTables: TableRef[], now = new Date()): CoverageActionResult {
    const dealer = this.getStaff(dealerId);
    if (!dealer || !isRotationDealer(dealer)) return { ok: true };

    const coverage = this.secureCoverageBeforeTableRelease(dealer, activeTables, now, "send to pool");
    if (!coverage.ok) return coverage;

    this.flushDealTime(dealer, now);
    this.flushBreakTime(dealer, now);
    this.clearTableAssignment(dealer, now);
    this.removeFromQueues(dealerId);
    this.setState(dealer, "ready");
    this.data.poolQueue.unshift(dealerId);
    this.rebalanceStandby();
    this.markDutyChange(dealer, now);
    this.logWork(dealer, "break_end", null, now, { note: "Moved to staff pool by operator" });
    this.pushNotification(
      dealer.id,
      "MOVED_TO_POOL",
      "Operator moved you to the dealer pool. Wait in the lounge for assignment.",
      null,
      now,
    );
    this.fillEmptyTables(activeTables, now, "post_pool");
    return { ok: true };
  }

  private startBreak(dealerId: string, now: Date, notify: boolean, operatorInitiated = false): void {
    const dealer = this.getStaff(dealerId);
    if (!dealer) return;
    this.flushDealTime(dealer, now);
    dealer.breakEndAt = addMinutes(now, this.data.settings.tBreakMinutes);
    dealer.breakStartedAt = nowIso(now);
    this.setState(dealer, "on_break");
    this.autoAckBreakDuty(dealer, now);
    this.logWork(dealer, "break_start", null, now);
    if (notify) {
      this.pushNotification(
        dealer.id,
        "GO_ON_BREAK",
        operatorInitiated
          ? "Operator sent you on break. Go to the dealer lounge."
          : "Break time started.",
        null,
        now,
      );
    }
  }

  fillEmptyTables(activeTables: TableRef[], now: Date, reason: string): void {
    if (!this.data.settings.enabled) return;
    if (!this.data.settings.autoAssign) return;
    if (this.data.settings.activeTournamentBreakLevelIndex !== null) return;

    const sorted = [...activeTables].sort((a, b) => a.number - b.number);
    for (const table of sorted) {
      if (this.getDealerOnTable(table.id)) continue;

      const zoneId = this.zoneIdForTable(table);
      const standbyId = this.findStandbyId(zoneId);
      if (standbyId && this.assignToTableInternal(standbyId, table, now, reason, true)) {
        this.rebalanceStandby();
        continue;
      }

      const readyId = this.findReadyId(zoneId);
      if (readyId && this.assignToTableInternal(readyId, table, now, reason, true)) {
        this.rebalanceStandby();
      }
    }
  }

  /** T_deal expired — start handoff */
  beginHandoff(tableId: string, activeTables: TableRef[], now: Date): { outgoingId: string; incomingId: string | null } | null {
    const outgoing = this.data.staff.find(s => s.tableId === tableId && s.state === "on_table");
    if (!outgoing) return null;

    const tableRef = activeTables.find(t => t.id === tableId) ?? {
      id: tableId,
      number: outgoing.tableNumber ?? 0,
    };

    outgoing.totalWorkMinutes += this.data.settings.tDealMinutes;
    if (!this.canWork(outgoing)) {
      const replacementId = this.tryAssignReplacementToTable(tableRef, now, "overtime_handoff", outgoing.id);
      if (replacementId) {
        this.flushDealTime(outgoing, now);
        outgoing.releaseAckAt = null;
        outgoing.dealEndAt = nowIso(now);
        this.setState(outgoing, "incoming");
        this.markDutyChange(outgoing, now);
        this.pushNotification(
          outgoing.id,
          "END_SHIFT_AT_TABLE",
          `Table ${outgoing.tableNumber} rotation ended. Go to the break lounge.`,
          outgoing.tableNumber,
          now,
        );
        return { outgoingId: outgoing.id, incomingId: replacementId };
      }

      if (this.isSoleTableCoverage(outgoing.id, tableId)) {
        this.extendDealForCoverage(
          outgoing,
          tableRef,
          now,
          "Shift limit reached — extended to maintain table coverage until replacement is available",
        );
        return { outgoingId: outgoing.id, incomingId: null };
      }

      this.releaseAfterDeal(outgoing, activeTables, now);
      return { outgoingId: outgoing.id, incomingId: null };
    }

    const incomingId = this.findStandbyId() ?? this.findReadyId();
    if (!incomingId && this.isSoleTableCoverage(outgoing.id, tableId)) {
      this.renewDealStint(outgoing, tableRef, now, "No standby — deal stint renewed");
      return { outgoingId: outgoing.id, incomingId: null };
    }

    this.flushDealTime(outgoing, now);
    outgoing.releaseAckAt = null;
    outgoing.dealEndAt = nowIso(now);
    this.setState(outgoing, "incoming");
    this.markDutyChange(outgoing, now);
    this.pushNotification(
      outgoing.id,
      "END_SHIFT_AT_TABLE",
      `Table ${outgoing.tableNumber} rotation ended. Go to the break lounge.`,
      outgoing.tableNumber,
      now,
    );

    if (incomingId) {
      const incoming = this.getStaff(incomingId)!;
      this.removeFromQueues(incomingId);
      incoming.tableId = tableId;
      incoming.tableNumber = outgoing.tableNumber;
      incoming.dealEndAt = null;
      incoming.assignmentAckAt = null;
      this.beginTableStint(incoming, now);
      this.setState(incoming, "incoming");
      this.markDutyChange(incoming, now);
      this.pushNotification(
        incoming.id,
        "ASSIGN_TABLE",
        `Table ${outgoing.tableNumber} assignment. Tap I'M GOING on your phone.`,
        outgoing.tableNumber,
        now,
      );
    }

    return { outgoingId: outgoing.id, incomingId };
  }

  /** Complete handoffs stuck waiting for phone confirm, or release lone outgoing dealers. */
  private resolveStuckHandoffs(activeTables: TableRef[], now: Date): void {
    for (const table of activeTables) {
      const assigned = this.data.staff.filter(
        s => s.tableId === table.id && (s.state === "on_table" || s.state === "incoming"),
      );
      if (assigned.length === 0) continue;

      const activeDealer = assigned.find(s => s.state === "on_table");
      const replacement = assigned.find(s => s.state === "incoming" && !s.dealEndAt);
      const outgoing = assigned.find(
        s => s.state === "incoming" && s.dealEndAt && new Date(s.dealEndAt).getTime() <= now.getTime(),
      );

      if (replacement && (outgoing || activeDealer)) {
        const assignedAt = replacement.dealStartedAt
          ? new Date(replacement.dealStartedAt).getTime()
          : 0;
        if (assignedAt > 0 && now.getTime() - assignedAt >= HANDOFF_CONFIRM_GRACE_MS) {
          replacement.assignmentAckAt = replacement.assignmentAckAt ?? nowIso(now);
          this.confirmArrival(replacement.id, table.id, now);
        }
        continue;
      }

      if (replacement && !outgoing && !activeDealer) {
        this.confirmArrival(replacement.id, table.id, now);
        continue;
      }

      if (outgoing && !replacement && !activeDealer) {
        const tableRef = activeTables.find(t => t.id === table.id);
        if (!tableRef) continue;

        const repId = this.tryAssignReplacementToTable(tableRef, now, "stuck_handoff", outgoing.id);
        if (repId) continue;

        this.renewDealStint(
          outgoing,
          tableRef,
          now,
          "Handoff timed out — dealer restored to table",
        );
      }
    }
  }

  private releaseAfterDeal(dealer: DealerStaff, activeTables: TableRef[], now: Date): void {
    const tableNum = dealer.tableNumber;
    const tableId = dealer.tableId;
    if (tableId && tableNum != null && this.isSoleTableCoverage(dealer.id, tableId)) {
      const tableRef = activeTables.find(t => t.id === tableId) ?? { id: tableId, number: tableNum };
      const replacementId = this.tryAssignReplacementToTable(tableRef, now, "max_work_release", dealer.id);
      if (!replacementId) {
        this.extendDealForCoverage(
          dealer,
          tableRef,
          now,
          "Maximum work time reached but table cannot be left uncovered",
        );
        return;
      }
    }

    this.clearTableAssignment(dealer, now);
    this.removeFromQueues(dealer.id);
    this.data.poolQueue.push(dealer.id);
    this.logoutDealer(dealer, now, "Maximum work time reached");
    this.fillEmptyTables(activeTables, now, "post_release");
  }

  /** Phone — dealer accepted table assignment in one step (going + seated). */
  acceptTableAssignment(dealerId: string, tableId: string, now = new Date()): boolean {
    const dealer = this.getStaff(dealerId);
    if (!dealer || dealer.state !== "incoming" || !dealer.tableId || dealer.tableId !== tableId || dealer.dealEndAt) {
      return false;
    }

    if (!dealer.assignmentAckAt) {
      dealer.assignmentAckAt = nowIso(now);
      this.logWork(dealer, "ack_assignment", dealer.tableNumber, now);
      this.markNotificationsRead(dealerId, ["ASSIGN_TABLE", "MANUAL_ASSIGN"], now);
    }

    return this.confirmArrival(dealerId, tableId, now);
  }

  /** Phone — dealer tapped "I'm going" */
  acknowledgeAssignment(dealerId: string, now = new Date()): boolean {
    const dealer = this.getStaff(dealerId);
    if (!dealer || dealer.state !== "incoming" || !dealer.tableId || dealer.dealEndAt) {
      return false;
    }
    if (!dealer.assignmentAckAt) {
      dealer.assignmentAckAt = nowIso(now);
      this.logWork(dealer, "ack_assignment", dealer.tableNumber, now);
    }
    this.markNotificationsRead(dealerId, ["ASSIGN_TABLE", "MANUAL_ASSIGN"], now);
    return true;
  }

  /** Phone — outgoing dealer acknowledged release notice */
  acknowledgeRelease(dealerId: string, now = new Date()): boolean {
    const dealer = this.getStaff(dealerId);
    if (!dealer || dealer.state !== "incoming" || !dealer.dealEndAt) {
      return false;
    }
    dealer.releaseAckAt = nowIso(now);
    dealer.dutyAckAt = nowIso(now);
    this.markNotificationsRead(dealerId, ["END_SHIFT_AT_TABLE"], now);
    this.logWork(dealer, "released", dealer.tableNumber, now, { note: "Acknowledged rotation end" });
    return true;
  }

  /** Phone confirm arrival — completes handoff */
  confirmArrival(dealerId: string, tableId: string, now = new Date()): boolean {
    const incoming = this.getStaff(dealerId);
    if (!incoming || incoming.state !== "incoming" || incoming.tableId !== tableId || incoming.dealEndAt) {
      return false;
    }

    if (!incoming.assignmentAckAt) {
      incoming.assignmentAckAt = nowIso(now);
    }

    const tableNumber = incoming.tableNumber!;
    const outgoing = this.data.staff.find(
      s => s.tableId === tableId && s.id !== dealerId && (s.state === "incoming" || s.state === "on_table"),
    );

    incoming.dealEndAt = addMinutes(now, this.data.settings.tDealMinutes);
    incoming.sessionStartedAt = incoming.sessionStartedAt ?? nowIso(now);
    incoming.assignmentAckAt = null;
    incoming.dutyAckAt = nowIso(now);
    this.setState(incoming, "on_table");
    this.logWork(incoming, "confirmed_arrival", tableNumber, now);
    this.markNotificationsRead(dealerId, ["ASSIGN_TABLE", "MANUAL_ASSIGN"], now);

    if (outgoing) {
      this.clearTableAssignment(outgoing, now);
      this.removeFromQueues(outgoing.id);
      this.data.poolQueue.push(outgoing.id);
      this.startBreak(outgoing.id, now, true);
    }

    this.rebalanceStandby();
    this.pushNotification(
      incoming.id,
      "STANDBY_READY",
      `You are now dealing Table ${tableNumber}.`,
      tableNumber,
      now,
    );
    return true;
  }

  /** Operator urgent call — dealer must come to poker room (even during break). */
  emergencyCall(dealerId: string, now = new Date()): boolean {
    const dealer = this.getStaff(dealerId);
    if (!dealer || !dealer.active || !isRotationDealer(dealer)) return false;

    const callable = new Set<DealerStaff["state"]>(["on_break", "waiting", "ready", "pool", "standby"]);
    if (!callable.has(dealer.state)) return false;

    dealer.emergencyCallAt = nowIso(now);
    dealer.emergencyAckAt = null;
    this.markDutyChange(dealer, now);
    this.logWork(dealer, "manual_move", null, now, { note: "Emergency room call" });
    this.pushNotification(
      dealer.id,
      "EMERGENCY_CALL",
      "URGENT: Come to the poker room. Go to the supervisor.",
      null,
      now,
    );
    return true;
  }

  /** Phone — dealer acknowledged urgent room call. */
  acknowledgeEmergencyCall(dealerId: string, now = new Date()): boolean {
    const dealer = this.getStaff(dealerId);
    if (!dealer || !dealer.emergencyCallAt) return false;
    if (dealer.emergencyAckAt
      && new Date(dealer.emergencyAckAt).getTime() >= new Date(dealer.emergencyCallAt).getTime()) {
      return false;
    }

    dealer.emergencyAckAt = nowIso(now);
    dealer.dutyAckAt = nowIso(now);
    this.markNotificationsRead(dealerId, ["EMERGENCY_CALL"], now);
    this.logWork(dealer, "ack_assignment", null, now, { note: "Emergency call acknowledged" });
    return true;
  }

  /** Phone — dealer accepted break / waiting / pool duty change from operator */
  acknowledgeDuty(dealerId: string, now = new Date()): boolean {
    const dealer = this.getStaff(dealerId);
    if (!dealer) return false;

    if (dealer.state === "on_break") {
      dealer.dutyAckAt = nowIso(now);
      this.markNotificationsRead(dealerId, ["GO_ON_BREAK", "TOURNAMENT_BREAK"], now);
      this.logWork(dealer, "ack_assignment", null, now, { note: "Accepted break duty" });
      return true;
    }

    if (dealer.state === "waiting") {
      dealer.dutyAckAt = nowIso(now);
      this.markNotificationsRead(dealerId, ["MOVED_TO_WAITING"], now);
      this.logWork(dealer, "ack_assignment", null, now, { note: "Accepted waiting list duty" });
      return true;
    }

    if (dealer.state === "ready" || dealer.state === "pool" || dealer.state === "standby") {
      if (dealer.dutyAckAt && dealer.lastDutyChangeAt
        && new Date(dealer.dutyAckAt).getTime() >= new Date(dealer.lastDutyChangeAt).getTime()) {
        return false;
      }
      dealer.dutyAckAt = nowIso(now);
      this.markNotificationsRead(dealerId, ["MOVED_TO_POOL"], now);
      this.logWork(dealer, "ack_assignment", null, now, { note: "Accepted pool duty" });
      return true;
    }

    return false;
  }

  /** Salon QR check-in */
  checkIn(dealerId: string, activeTables: TableRef[], now = new Date()): { tableNumber: number | null; message: string } {
    const dealer = this.getStaff(dealerId);
    if (!dealer || !dealer.active || !isRotationDealer(dealer)) {
      return { tableNumber: null, message: "Dealer not found or inactive." };
    }
    if (!this.canWork(dealer)) {
      return { tableNumber: null, message: "Maximum work time reached for today." };
    }

    this.logWork(dealer, "check_in", null, now);

    if (dealer.state === "on_table" && dealer.tableNumber) {
      return { tableNumber: dealer.tableNumber, message: `You are assigned to Table ${dealer.tableNumber}.` };
    }

    if (dealer.state === "incoming" && dealer.tableNumber) {
      if (!dealer.dealEndAt && !dealer.assignmentAckAt) {
        return {
          tableNumber: dealer.tableNumber,
          message: `Table ${dealer.tableNumber} — tap I'M GOING on your phone.`,
        };
      }
      if (!dealer.dealEndAt && dealer.assignmentAckAt) {
        return {
          tableNumber: dealer.tableNumber,
          message: `Table ${dealer.tableNumber} — tap I AM SEATED when you are in the dealer seat.`,
        };
      }
      return {
        tableNumber: dealer.tableNumber,
        message: `Table ${dealer.tableNumber} rotation ended. Go to the break lounge.`,
      };
    }

    this.removeFromQueues(dealerId);
    this.data.waitingList = this.data.waitingList.filter(id => id !== dealerId);

    const emptyTable = [...activeTables]
      .sort((a, b) => a.number - b.number)
      .find(t => !this.getDealerOnTable(t.id));

    if (emptyTable && this.data.settings.enabled && this.data.settings.autoAssign) {
      this.assignToTableInternal(dealerId, emptyTable, now, "check_in", true);
      return {
        tableNumber: emptyTable.number,
        message: `Assigned to Table ${emptyTable.number}. Confirm when you arrive.`,
      };
    }

    this.data.poolQueue.push(dealerId);
    if (dealer.state === "on_break" && dealer.breakEndAt && new Date(dealer.breakEndAt) > now) {
      return { tableNumber: null, message: `Break active. Ready at ${new Date(dealer.breakEndAt).toLocaleTimeString()}.` };
    }

    this.setState(dealer, "ready");
    this.rebalanceStandby();
    this.fillEmptyTables(activeTables, now, "check_in_fill");

    const after = this.getStaff(dealerId);
    if (after?.state === "on_table" && after.tableNumber) {
      return { tableNumber: after.tableNumber, message: `Assigned to Table ${after.tableNumber}.` };
    }
    if (after?.state === "standby") {
      return { tableNumber: null, message: "You are on standby. You will be notified when a table opens." };
    }
    return { tableNumber: null, message: "You are in the dealer pool. Wait for assignment." };
  }

  onTableClosed(tableId: string, now = new Date()): void {
    const dealer = this.getDealerOnTable(tableId);
    if (!dealer) return;
    this.clearTableAssignment(dealer, now);
    this.removeFromQueues(dealer.id);
    this.data.poolQueue.push(dealer.id);
    this.startBreak(dealer.id, now, true);
    this.rebalanceStandby();
    this.logWork(dealer, "released", null, now, { note: "Table closed" });
    this.pushNotification(dealer.id, "TABLE_CLOSED", "Your table was closed. Break started.", null, now);
  }

  /** Process break end timers (also runs during tournament structure breaks). */
  processBreakExpiries(activeTables: TableRef[], now = new Date()): void {
    for (const dealer of this.data.staff) {
      if (dealer.state !== "on_break" || !dealer.breakEndAt) continue;
      if (new Date(dealer.breakEndAt).getTime() > now.getTime()) continue;

      if (this.data.settings.activeTournamentBreakLevelIndex !== null) {
        continue;
      }

      this.flushBreakTime(dealer, now);
      dealer.breakEndAt = null;
      this.setState(dealer, "ready");
      this.logWork(dealer, "break_end", null, now);
      this.pushNotification(dealer.id, "STANDBY_READY", "Break ended. You are ready for assignment.", null, now);
    }
  }

  private resumeDealerAfterTournamentBreak(dealer: DealerStaff, activeTables: TableRef[], now: Date): void {
    this.flushBreakTime(dealer, now);
    dealer.breakEndAt = null;
    dealer.breakStartedAt = null;
    this.removeFromQueues(dealer.id);
    this.logWork(dealer, "break_end", dealer.tableNumber, now, { note: "Tournament break ended" });

    const tableStillActive = dealer.tableId
      && dealer.tableNumber
      && activeTables.some(t => t.id === dealer.tableId);

    if (tableStillActive) {
      dealer.dealEndAt = null;
      dealer.assignmentAckAt = null;
      dealer.releaseAckAt = null;
      this.beginTableStint(dealer, now);
      this.setState(dealer, "incoming");
      this.markDutyChange(dealer, now);
      this.pushNotification(
        dealer.id,
        "ASSIGN_TABLE",
        `Break ended. Return to Table ${dealer.tableNumber} and resume dealing.`,
        dealer.tableNumber,
        now,
      );
      return;
    }

    if (dealer.tableId) {
      this.clearTableAssignment(dealer, now);
    }

    this.setState(dealer, "ready");
    if (!this.data.poolQueue.includes(dealer.id)) {
      this.data.poolQueue.push(dealer.id);
    }
    this.markDutyChange(dealer, now);
    this.pushNotification(
      dealer.id,
      "STANDBY_READY",
      "Tournament break ended. Ready for next assignment.",
      null,
      now,
    );
  }

  /** Process clock tick — deal expiry, break expiry */
  processTick(activeTables: TableRef[], now = new Date()): void {
    if (!this.data.settings.enabled) return;
    if (this.data.settings.activeTournamentBreakLevelIndex !== null) {
      this.processBreakExpiries(activeTables, now);
      return;
    }

    repairDealerTimingFields(this.data.staff, this.data.settings, now);
    if (!this.data.settings.handoffFrozen) {
      this.resolveStuckHandoffs(activeTables, now);
    }
    this.processBreakExpiries(activeTables, now);
    this.rebalanceStandby();
    this.fillEmptyTables(activeTables, now, "auto_fill");

    if (!this.data.settings.handoffFrozen) {
      for (const table of activeTables) {
        const dealer = this.data.staff.find(s => s.tableId === table.id && s.state === "on_table");
        if (!dealer || !isDealStintExpired(dealer, this.data.settings, now)) continue;
        this.beginHandoff(table.id, activeTables, now);
        this.fillEmptyTables(activeTables, now, "post_handoff");
      }
    }

    this.refreshCoverageAlerts(activeTables, now);
  }

  /** Tournament structure break — all dealers rest; table assignments preserved. */
  onTournamentBreak(
    currentLevelIndex: number,
    _activeTables: TableRef[],
    breakMinutes: number,
    breakEndAt: string,
    now = new Date(),
  ): void {
    const enteringBreak = this.data.settings.activeTournamentBreakLevelIndex !== currentLevelIndex;
    if (enteringBreak) {
      this.data.settings.activeTournamentBreakLevelIndex = currentLevelIndex;
      this.data.settings.lastBreakLevelIndex = currentLevelIndex;
      this.data.waitingList = [];
    }

    for (const dealer of this.data.staff) {
      if (!dealer.active || dealer.state === "off_duty") continue;
      if (!isRotationDealer(dealer)) continue;

      if (!this.canWork(dealer)) {
        this.setState(dealer, "off_duty");
        continue;
      }

      const needsBreakNotification = dealer.state !== "on_break";

      if (dealer.state === "on_table" || dealer.state === "incoming") {
        this.flushDealTime(dealer, now);
      }

      this.removeFromQueues(dealer.id);

      const tableNum = dealer.tableNumber;
      if (needsBreakNotification || enteringBreak) {
        dealer.breakStartedAt = nowIso(now);
      }
      dealer.breakEndAt = breakEndAt;
      this.setState(dealer, "on_break");
      this.autoAckBreakDuty(dealer, now);

      if (needsBreakNotification) {
        this.logWork(dealer, "break_start", tableNum, now, {
          note: `Tournament structure break (${breakMinutes} min)`,
        });

        const message = tableNum
          ? `Tournament break (${breakMinutes} min). Leave the table and rest. Return to Table ${tableNum} when break ends.`
          : `Tournament break (${breakMinutes} min). Wait in the lounge for your next assignment.`;
        this.pushNotification(dealer.id, "TOURNAMENT_BREAK", message, tableNum, now);
      }
    }
  }

  /** Clock left tournament break level — resume any dealers still resting. */
  onTournamentBreakEnd(activeTables: TableRef[], now = new Date()): void {
    if (this.data.settings.activeTournamentBreakLevelIndex === null) return;

    this.data.settings.activeTournamentBreakLevelIndex = null;
    this.data.settings.lastBreakLevelIndex = null;

    for (const dealer of this.data.staff) {
      if (dealer.state === "on_break") {
        this.resumeDealerAfterTournamentBreak(dealer, activeTables, now);
      }
    }

    this.rebalanceStandby();
    this.fillEmptyTables(activeTables, now, "post_tournament_break");
    this.refreshCoverageAlerts(activeTables, now);
  }

  getDealerForTable(tableId: string): DealerStaff | undefined {
    return this.data.staff.find(
      s => s.tableId === tableId && (s.state === "on_table" || s.state === "incoming"),
    );
  }

  isTableUncovered(tableId: string): boolean {
    return !this.getDealerForTable(tableId);
  }

  commitNotifications(): void {
    this.data.notifications.push(...this.pendingNotifications);
    if (this.data.notifications.length > 200) {
      this.data.notifications = this.data.notifications.slice(-200);
    }
    this.pendingNotifications = [];
  }
}

export function createDefaultRotationData(): DealerRotationData {
  return structuredClone(DEFAULT_DEALER_ROTATION);
}
