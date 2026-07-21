import type { DealerStaff } from "../server/dealerRotation/types";
import { isIncomingReplacement, isOutgoingHandoffWait } from "../dealerRotation/dealerTimeUtils";

/** Dealer phone may show this table's screen only while actively dealing or finishing handoff release. */
export function dealerAssignedToTable(
  dealer: Pick<DealerStaff, "state" | "tableNumber" | "tableId" | "dealEndAt" | "releaseAckAt"> | null | undefined,
  tableNumber: number,
  now = Date.now(),
): boolean {
  if (!dealer?.tableNumber || dealer.tableNumber !== tableNumber) {
    return false;
  }

  if (dealer.state === "on_table") {
    return true;
  }

  if (dealer.state === "incoming" && isOutgoingHandoffWait(dealer as DealerStaff, now)) {
    return true;
  }

  if (dealer.state === "incoming" && isIncomingReplacement(dealer as DealerStaff)) {
    return false;
  }

  return false;
}

export function dealerNeedsLoungeScreen(
  dealer: Pick<DealerStaff, "state" | "tableNumber" | "tableId" | "dealEndAt" | "releaseAckAt"> | null | undefined,
  tableNumber: number,
  now = Date.now(),
): boolean {
  if (!dealer) {
    return false;
  }
  return !dealerAssignedToTable(dealer, tableNumber, now);
}
