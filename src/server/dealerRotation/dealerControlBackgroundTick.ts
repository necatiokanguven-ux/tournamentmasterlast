import type { TournamentDatabase } from "../tournamentDatabase";
import type { RotationTriggerService } from "./RotationTriggerService";
import { activeTablesFromDb } from "./RotationTriggerService";
import { DealerQueueManager } from "./DealerQueueManager";
import { repairDealerTimingFields } from "../../dealerRotation/dealerTimeUtils";
import { buildCoverageSummary } from "../../dealerRotation/dealerCoverageUtils";
import { DEAL_BEFORE_BREAK_DISMISS_KEY } from "../../dealerRotation/dealerAlertSilencing";
import { computeRotationTimingInsight } from "../../dealerRotation/dealerRotationTiming";
import { processPhoneGraceExpiries } from "./phoneGrace";
import { runDealerRotationTick } from "./dealerRotationTick";

function withManager(db: TournamentDatabase, fn: (manager: DealerQueueManager) => void) {
  const manager = new DealerQueueManager(db.dealerRotation);
  if (process.env.DEALER_ZONES === "true") {
    manager.configureZones(true, db.settings.dealerZones ?? []);
  }
  fn(manager);
  manager.commitNotifications();
  db.dealerRotation = manager.export();
}

/**
 * Server-side dealer control maintenance (Phase 4.3).
 * Previously ran on every GET /api/dealer-control/state poll.
 */
export function runDealerControlBackgroundTick(
  db: TournamentDatabase,
  triggerService: RotationTriggerService,
): boolean {
  let changed = false;

  if (db.dealerRotation.settings.enabled) {
    if (runDealerRotationTick(db, triggerService)) {
      changed = true;
    }
  } else {
    const timingRepaired = repairDealerTimingFields(db.dealerRotation.staff, db.dealerRotation.settings);
    if (timingRepaired) {
      changed = true;
    }
  }

  const beforeBreakAck = JSON.stringify(db.dealerRotation);
  withManager(db, manager => {
    manager.repairUnackedBreakDuty(new Date());
  });
  if (JSON.stringify(db.dealerRotation) !== beforeBreakAck) {
    changed = true;
  }

  const now = Date.now();
  if (db.dealerRotation.settings.enabled) {
    const alertsBefore = JSON.stringify(db.dealerRotation.operatorAlerts ?? []);
    withManager(db, manager => {
      manager.refreshCoverageAlerts(activeTablesFromDb(db.tables), new Date(now));
    });
    if (JSON.stringify(db.dealerRotation.operatorAlerts) !== alertsBefore) {
      changed = true;
    }

    const coverageSummary = buildCoverageSummary(
      db.dealerRotation.staff,
      activeTablesFromDb(db.tables),
      now,
    );

    if (coverageSummary.activeTableCount > 0) {
      const timing = computeRotationTimingInsight({
        tableCount: coverageSummary.activeTableCount,
        dealerCount: coverageSummary.activeDealerCount,
        requiredDealerCount: coverageSummary.requiredDealerCount,
        tDealMinutes: db.dealerRotation.settings.tDealMinutes,
        tBreakMinutes: db.dealerRotation.settings.tBreakMinutes,
      });
      if (
        timing.workBeforeBreakOk
        && db.dealerRotation.dismissedOperatorAlertKeys?.includes(DEAL_BEFORE_BREAK_DISMISS_KEY)
      ) {
        db.dealerRotation.dismissedOperatorAlertKeys = db.dealerRotation.dismissedOperatorAlertKeys.filter(
          key => key !== DEAL_BEFORE_BREAK_DISMISS_KEY,
        );
        changed = true;
      }
    }
  }

  if (processPhoneGraceExpiries(db.dealerRotation.staff)) {
    changed = true;
  }

  return changed;
}
