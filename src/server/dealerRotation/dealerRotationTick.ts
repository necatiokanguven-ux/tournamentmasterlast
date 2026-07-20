import type { TournamentDatabase } from "../tournamentDatabase";
import { activeTablesFromDb } from "./RotationTriggerService";
import type { RotationTriggerService } from "./RotationTriggerService";
import type { DealerRotationData } from "./types";

export function runDealerRotationTick(
  db: TournamentDatabase,
  triggerService: RotationTriggerService,
): boolean {
  if (!db.dealerRotation.settings.enabled) return false;

  const before = JSON.stringify(db.dealerRotation);
  db.dealerRotation = triggerService.onTournamentClockTick(new Date());
  return JSON.stringify(db.dealerRotation) !== before;
}

export function runDealerRotationOnClockSync(
  db: TournamentDatabase,
  triggerService: RotationTriggerService,
): DealerRotationData {
  if (!db.dealerRotation.settings.enabled) {
    return db.dealerRotation;
  }

  db.dealerRotation = triggerService.onTournamentClockTick();
  return db.dealerRotation;
}

export function runDealerRotationOnTableClosed(
  db: TournamentDatabase,
  tableId: string,
  triggerService: RotationTriggerService,
): void {
  if (!db.dealerRotation.settings.enabled) return;
  db.dealerRotation = triggerService.onTableClosed(tableId);
}

export function syncDealerRotationAfterSave(
  db: TournamentDatabase,
  triggerService: RotationTriggerService,
): void {
  if (!db.dealerRotation.settings.enabled) return;
  db.dealerRotation = triggerService.syncTableCount(activeTablesFromDb(db.tables));
}
