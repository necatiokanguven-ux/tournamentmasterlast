import fs from "fs";
import { ensureUpdatesDir, getStateFilePath } from "./updatePaths";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "downloading"
  | "downloaded"
  | "verifying"
  | "applying"
  | "awaiting_health"
  | "complete"
  | "failed";

export interface UpdateState {
  phase: UpdatePhase;
  targetVersion?: string;
  downloadPercent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  installerPath?: string;
  previousVersion?: string;
  rollbackPath?: string;
  error?: string;
  errorCode?: string;
  snoozedUntil?: string | null;
  lastCheckAt?: string;
  updatedAt?: string;
}

const DEFAULT_STATE: UpdateState = { phase: "idle" };

export function readUpdateState(): UpdateState {
  try {
    const statePath = getStateFilePath();
    if (!fs.existsSync(statePath)) {
      return { ...DEFAULT_STATE };
    }
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as UpdateState;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeUpdateState(patch: Partial<UpdateState>): UpdateState {
  ensureUpdatesDir();
  const next: UpdateState = {
    ...readUpdateState(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getStateFilePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function clearUpdateStateFields(fields: (keyof UpdateState)[]): void {
  const current = readUpdateState();
  for (const field of fields) {
    delete current[field];
  }
  writeUpdateState(current);
}

export function isUpdateSnoozed(state: UpdateState = readUpdateState()): boolean {
  if (!state.snoozedUntil) {
    return false;
  }
  const until = Date.parse(state.snoozedUntil);
  return Number.isFinite(until) && until > Date.now();
}
