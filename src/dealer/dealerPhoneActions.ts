import type { DealerStaff } from "../server/dealerRotation/types";
import { isOutgoingHandoffWait } from "../dealerRotation/dealerTimeUtils";
import { hasPendingEmergency } from "../dealerRotation/dealerEmergencyUtils";
import type { TournamentBreakStatus } from "../server/dealerRotation/RotationTriggerService";

export type DealerPhoneContext = {
  tournamentBreak?: TournamentBreakStatus;
};

export type DealerPhoneAction =
  | { kind: "none" }
  | { kind: "emergency_call"; message: string }
  | { kind: "go_to_table"; tableNumber: number; tableId: string; message: string }
  | { kind: "rotation_ended"; tableNumber: number; message: string }
  | { kind: "go_to_break"; message: string; breakEndAt: string | null; needsAccept: boolean; returnTableNumber: number | null }
  | { kind: "on_waiting"; message: string }
  | { kind: "in_pool"; message: string };

export function needsDutyAck(
  dealer: Pick<DealerStaff, "lastDutyChangeAt" | "dutyAckAt">,
): boolean {
  if (!dealer.lastDutyChangeAt) return false;
  if (!dealer.dutyAckAt) return true;
  return new Date(dealer.dutyAckAt).getTime() < new Date(dealer.lastDutyChangeAt).getTime();
}

export function getDealerPhoneAction(
  dealer: Pick<
    DealerStaff,
    | "state"
    | "tableId"
    | "tableNumber"
    | "dealEndAt"
    | "releaseAckAt"
    | "lastDutyChangeAt"
    | "dutyAckAt"
    | "breakEndAt"
    | "emergencyCallAt"
    | "emergencyAckAt"
  >,
  latestNotification?: { type: string; message: string } | null,
  context: DealerPhoneContext = {},
): DealerPhoneAction {
  const tournamentBreakActive = Boolean(context.tournamentBreak?.active);
  const tournamentBreakEndAt = context.tournamentBreak?.breakEndAt ?? null;

  if (hasPendingEmergency(dealer)) {
    return {
      kind: "emergency_call",
      message: latestNotification?.type === "EMERGENCY_CALL"
        ? latestNotification.message
        : "URGENT: Come to the poker room. Go to the supervisor.",
    };
  }

  if (tournamentBreakActive && dealer.state !== "off_duty") {
    const returnTable = dealer.tableNumber ?? null;
    return {
      kind: "go_to_break",
      message: latestNotification?.type === "TOURNAMENT_BREAK"
        ? latestNotification.message
        : returnTable
          ? `Tournament break in progress. Leave Table ${returnTable} and rest. Return to the same table when break ends.`
          : "Tournament break in progress. Wait in the lounge.",
      breakEndAt: tournamentBreakEndAt ?? dealer.breakEndAt ?? null,
      needsAccept: false,
      returnTableNumber: returnTable,
    };
  }

  if (dealer.state === "incoming" && dealer.tableId && dealer.tableNumber) {
    if (isOutgoingHandoffWait(dealer as DealerStaff)) {
      if (!dealer.releaseAckAt) {
        return {
          kind: "rotation_ended",
          tableNumber: dealer.tableNumber,
          message: latestNotification?.message
            ?? `Table ${dealer.tableNumber} rotation ended. Go to the break lounge.`,
        };
      }
      return { kind: "none" };
    }

    return {
      kind: "go_to_table",
      tableNumber: dealer.tableNumber,
      tableId: dealer.tableId,
      message: latestNotification?.message
        ?? `You are assigned to Table ${dealer.tableNumber}.`,
    };
  }

  if (dealer.state === "on_break") {
    return {
      kind: "go_to_break",
      message: latestNotification?.message ?? "Go to the dealer lounge for break.",
      breakEndAt: dealer.breakEndAt ?? null,
      needsAccept: false,
      returnTableNumber: dealer.tableNumber ?? null,
    };
  }

  if (!needsDutyAck(dealer)) {
    return { kind: "none" };
  }

  if (dealer.state === "waiting") {
    return {
      kind: "on_waiting",
      message: latestNotification?.message ?? "You are on the dealer waiting list.",
    };
  }

  if (dealer.state === "ready" || dealer.state === "pool" || dealer.state === "standby") {
    return {
      kind: "in_pool",
      message: latestNotification?.message ?? "Wait in the dealer lounge for your next assignment.",
    };
  }

  return { kind: "none" };
}
