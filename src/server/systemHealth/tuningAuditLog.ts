export type TuningAuditEntry = {
  at: number;
  action: string;
  reason: string;
  expectedEffect: string;
};

const MAX_ENTRIES = 50;
const entries: TuningAuditEntry[] = [];

export function appendTuningAudit(entry: Omit<TuningAuditEntry, "at">): void {
  entries.unshift({ ...entry, at: Date.now() });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

export function getTuningAuditLog(limit = 20): TuningAuditEntry[] {
  return entries.slice(0, limit);
}

export function seedBaselineAudit(): void {
  if (entries.length > 0) return;
  appendTuningAudit({
    action: "Baseline recorded",
    reason: "Server started — normal poll values active",
    expectedEffect: "Monitoring load before any auto protection changes",
  });
}
