import { getEffectiveClock } from "../../clockLive";
import type { ClockState, TournamentSettings } from "../../types";
import { DealerQueueManager } from "./DealerQueueManager";
import type { DealerRotationData, TableRef } from "./types";

export function activeTablesFromDb(tables: Array<{ id: string; number: number }>): TableRef[] {
  return tables.map(t => ({ id: t.id, number: t.number }));
}

export function isClockOnBreakLevel(settings: TournamentSettings, clock: ClockState): boolean {
  const level = settings.blindStructure[clock.currentLevelIndex];
  return Boolean(level?.isBreak);
}

export function getStructureBreakMinutes(settings: TournamentSettings, clock: ClockState): number {
  const level = settings.blindStructure[clock.currentLevelIndex];
  if (!level?.isBreak) return 15;
  return Math.max(1, level.duration);
}

/** Break end aligned with tournament clock countdown (not a fixed duration from first tick). */
export function computeTournamentBreakEndAt(
  settings: TournamentSettings,
  clock: ClockState,
  now: Date | number = Date.now(),
): string {
  const level = settings.blindStructure[clock.currentLevelIndex];
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (!level?.isBreak) {
    return new Date(nowMs).toISOString();
  }
  const effective = getEffectiveClock(clock);
  const remainingSeconds = effective.isRunning
    ? Math.max(0, effective.timeRemaining)
    : level.duration * 60;
  return new Date(nowMs + remainingSeconds * 1000).toISOString();
}

export type TournamentBreakStatus = {
  active: boolean;
  levelIndex: number | null;
  breakEndAt: string | null;
  durationMinutes: number | null;
};

export function getTournamentBreakStatus(
  settings: TournamentSettings,
  clock: ClockState,
  now: Date | number = Date.now(),
): TournamentBreakStatus {
  if (!isClockOnBreakLevel(settings, clock)) {
    return { active: false, levelIndex: null, breakEndAt: null, durationMinutes: null };
  }
  return {
    active: true,
    levelIndex: clock.currentLevelIndex,
    breakEndAt: computeTournamentBreakEndAt(settings, clock, now),
    durationMinutes: getStructureBreakMinutes(settings, clock),
  };
}

export class RotationTriggerService {
  private manager: DealerQueueManager;

  constructor(private getData: () => { dealerRotation: DealerRotationData; tables: TableRef[]; settings: TournamentSettings; clock: ClockState }) {
    this.manager = new DealerQueueManager(getData().dealerRotation);
  }

  reload(): void {
    this.manager = new DealerQueueManager(this.getData().dealerRotation);
  }

  getManager(): DealerQueueManager {
    return this.manager;
  }

  exportData(): DealerRotationData {
    this.manager.commitNotifications();
    return this.manager.export();
  }

  onTournamentClockTick(now = new Date()): DealerRotationData {
    this.reload();
    const { settings, clock, tables } = this.getData();

    if (isClockOnBreakLevel(settings, clock)) {
      const breakMinutes = getStructureBreakMinutes(settings, clock);
      const breakEndAt = computeTournamentBreakEndAt(settings, clock, now);
      this.manager.onTournamentBreak(clock.currentLevelIndex, tables, breakMinutes, breakEndAt, now);
      this.manager.processBreakExpiries(tables, now);
    } else {
      this.manager.onTournamentBreakEnd(tables, now);
      this.manager.processTick(tables, now);
    }

    this.manager.commitNotifications();
    return this.manager.export();
  }

  onTableClosed(tableId: string, now = new Date()): DealerRotationData {
    this.reload();
    this.manager.onTableClosed(tableId, now);
    this.manager.commitNotifications();
    return this.manager.export();
  }

  syncTableCount(tables: TableRef[], now = new Date()): DealerRotationData {
    this.reload();
    this.manager.fillEmptyTables(tables, now, "table_sync");
    this.manager.commitNotifications();
    return this.manager.export();
  }
}
