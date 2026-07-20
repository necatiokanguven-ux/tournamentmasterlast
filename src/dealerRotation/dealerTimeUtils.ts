import type { DealerRotationSettings, DealerStaff } from "../server/dealerRotation/types";

export function elapsedSecondsSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

/** Tables view: minutes:seconds (e.g. 12:34) */
export function formatTableDealDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Dealer Control: hours and minutes (e.g. 12h 05m) */
export function formatSessionDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** Incoming dealer waiting for replacement to confirm (stint ended, still at table). */
export function isOutgoingHandoffWait(
  dealer: DealerStaff,
  now = Date.now(),
): boolean {
  if (dealer.state !== "incoming" || !dealer.tableId || !dealer.dealEndAt) return false;
  const endMs = new Date(dealer.dealEndAt).getTime();
  return Number.isFinite(endMs) && endMs <= now;
}

/** Incoming dealer assigned to replace outgoing — en route / awaiting phone confirm. */
export function isIncomingReplacement(dealer: DealerStaff): boolean {
  return dealer.state === "incoming" && Boolean(dealer.tableId) && !dealer.dealEndAt;
}

export function getDisplayDealerForTable(
  staff: DealerStaff[],
  tableId: string,
  now = Date.now(),
): DealerStaff | undefined {
  const assigned = staff.filter(
    s => s.tableId === tableId && (s.state === "on_table" || s.state === "incoming"),
  );
  if (assigned.length === 0) return undefined;

  return (
    assigned.find(s => s.state === "on_table")
    ?? assigned.find(s => isOutgoingHandoffWait(s, now))
    ?? assigned.find(s => isIncomingReplacement(s))
    ?? assigned[0]
  );
}

export function isDealStintExpired(
  dealer: DealerStaff,
  settings: Pick<DealerRotationSettings, "tDealMinutes">,
  now: Date | number = Date.now(),
): boolean {
  if (dealer.state !== "on_table" || !dealer.tableId) return false;

  const nowMs = typeof now === "number" ? now : now.getTime();
  const tDealMs = settings.tDealMinutes * 60_000;

  if (dealer.dealEndAt) {
    const endMs = new Date(dealer.dealEndAt).getTime();
    if (Number.isFinite(endMs) && endMs <= nowMs) return true;
  }

  const startedAt = resolveDealStartedAt(dealer, settings);
  if (startedAt) {
    const startMs = new Date(startedAt).getTime();
    if (Number.isFinite(startMs) && nowMs - startMs >= tDealMs) return true;
  }

  return false;
}

export function resolveDealStartedAt(
  dealer: DealerStaff,
  settings: Pick<DealerRotationSettings, "tDealMinutes">,
): string | null {
  if (dealer.dealStartedAt) return dealer.dealStartedAt;

  if (dealer.dealEndAt && settings.tDealMinutes > 0) {
    const endMs = new Date(dealer.dealEndAt).getTime();
    if (Number.isFinite(endMs)) {
      return new Date(endMs - settings.tDealMinutes * 60_000).toISOString();
    }
  }

  if (dealer.tableId && dealer.sessionStartedAt) {
    return dealer.sessionStartedAt;
  }

  return null;
}

export function resolveBreakStartedAt(
  dealer: DealerStaff,
  settings: Pick<DealerRotationSettings, "tBreakMinutes">,
): string | null {
  if (dealer.breakStartedAt) return dealer.breakStartedAt;

  if (dealer.breakEndAt && settings.tBreakMinutes > 0) {
    const endMs = new Date(dealer.breakEndAt).getTime();
    if (Number.isFinite(endMs)) {
      return new Date(endMs - settings.tBreakMinutes * 60_000).toISOString();
    }
  }

  return null;
}

export function getBreakRemainingSeconds(
  dealer: Pick<DealerStaff, "breakEndAt" | "breakStartedAt">,
  settings: Pick<DealerRotationSettings, "tBreakMinutes">,
  now = Date.now(),
): number {
  if (!dealer.breakEndAt) return 0;

  const endMs = new Date(dealer.breakEndAt).getTime();
  if (!Number.isFinite(endMs)) return 0;

  const remaining = Math.max(0, Math.floor((endMs - now) / 1000));
  if (settings.tBreakMinutes <= 0) return remaining;

  const maxConfigured = settings.tBreakMinutes * 60 + 300;
  if (remaining <= maxConfigured) return remaining;

  const startedAt = resolveBreakStartedAt(dealer as DealerStaff, settings);
  if (!startedAt) return remaining;

  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return remaining;

  const plannedDuration = Math.max(60, endMs - startMs);
  return Math.max(0, Math.floor((startMs + plannedDuration - now) / 1000));
}

export function getCurrentTableDealSeconds(
  dealer: Pick<DealerStaff, "state" | "tableId" | "dealStartedAt">,
  now = Date.now(),
  settings?: Pick<DealerRotationSettings, "tDealMinutes">,
): number {
  if (!dealer.tableId || dealer.state !== "on_table") return 0;

  const startedAt = settings ? resolveDealStartedAt(dealer as DealerStaff, settings) : dealer.dealStartedAt;
  return elapsedSecondsSince(startedAt, now);
}

/** Seconds until rotation for an active on_table dealer (null if unknown). */
export function getDealRemainingSeconds(
  dealer: Pick<DealerStaff, "state" | "dealEndAt">,
  now = Date.now(),
): number | null {
  if (dealer.state !== "on_table" || !dealer.dealEndAt) return null;
  const endMs = new Date(dealer.dealEndAt).getTime();
  if (!Number.isFinite(endMs)) return null;
  return Math.max(0, Math.floor((endMs - now) / 1000));
}

export function formatDealerTableTiming(
  dealer: Pick<DealerStaff, "state"> | null | undefined,
  dealSeconds: number,
  remainingSeconds: number | null,
): { dealLabel: string | null; rotationLabel: string | null } {
  if (!dealer) {
    return { dealLabel: null, rotationLabel: null };
  }

  if (dealer.state === "on_table") {
    return {
      dealLabel: dealSeconds > 0 ? formatTableDealDuration(dealSeconds) : "0:00",
      rotationLabel: remainingSeconds != null ? formatTableDealDuration(remainingSeconds) : null,
    };
  }

  if (dealer.state === "incoming") {
    return { dealLabel: "Handoff", rotationLabel: null };
  }

  return { dealLabel: null, rotationLabel: null };
}

export function getSessionDealSeconds(
  dealer: DealerStaff,
  now = Date.now(),
  settings?: Pick<DealerRotationSettings, "tDealMinutes">,
): number {
  let total = dealer.sessionDealSeconds ?? 0;
  if (dealer.state === "on_table" || dealer.state === "incoming") {
    const startedAt = settings ? resolveDealStartedAt(dealer, settings) : dealer.dealStartedAt;
    if (startedAt) {
      total += elapsedSecondsSince(startedAt, now);
    }
  }
  return total;
}

export function getSessionBreakSeconds(
  dealer: DealerStaff,
  now = Date.now(),
  settings?: Pick<DealerRotationSettings, "tBreakMinutes">,
): number {
  let total = dealer.sessionBreakSeconds ?? 0;
  if (dealer.state === "on_break") {
    const startedAt = settings ? resolveBreakStartedAt(dealer, settings) : dealer.breakStartedAt;
    if (startedAt) {
      total += elapsedSecondsSince(startedAt, now);
    }
  }
  return total;
}

/** Support staff (non-dealer) work seconds this session. */
export function getSupportStaffWorkSeconds(
  staff: Pick<DealerStaff, "shiftActive" | "shiftStartedAt" | "sessionStaffSeconds">,
  now = Date.now(),
): number {
  let total = staff.sessionStaffSeconds ?? 0;
  if (staff.shiftActive && staff.shiftStartedAt) {
    total += elapsedSecondsSince(staff.shiftStartedAt, now);
  }
  return total;
}

/** Persist missing timing anchors on staff records (returns true if anything changed). */
export function repairDealerTimingFields(
  staff: DealerStaff[],
  settings: DealerRotationSettings,
  now = new Date(),
): boolean {
  let changed = false;

  for (const dealer of staff) {
    if (
      dealer.state === "on_table"
      && dealer.tableId
      && !dealer.dealStartedAt
    ) {
      const resolved = resolveDealStartedAt(dealer, settings);
      dealer.dealStartedAt = resolved ?? now.toISOString();
      changed = true;
    }

    if (
      isIncomingReplacement(dealer)
      && !dealer.dealStartedAt
    ) {
      dealer.dealStartedAt = now.toISOString();
      changed = true;
    }

    if (dealer.state === "on_break" && !dealer.breakStartedAt) {
      const resolved = resolveBreakStartedAt(dealer, settings);
      if (resolved) {
        dealer.breakStartedAt = resolved;
        changed = true;
      }
    }

    if (dealer.sessionDealSeconds == null) {
      dealer.sessionDealSeconds = 0;
      changed = true;
    }
    if (dealer.sessionBreakSeconds == null) {
      dealer.sessionBreakSeconds = 0;
      changed = true;
    }
  }

  return changed;
}
