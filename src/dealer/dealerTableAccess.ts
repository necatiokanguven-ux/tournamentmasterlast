import type { DealerStaff } from "../server/dealerRotation/types";

/** Dealer phone may show this table's screen only while dealing or in handoff here. */
export function dealerAssignedToTable(
  dealer: Pick<DealerStaff, "state" | "tableNumber"> | null | undefined,
  tableNumber: number,
): boolean {
  if (!dealer?.tableNumber || dealer.tableNumber !== tableNumber) return false;
  return dealer.state === "on_table" || dealer.state === "incoming";
}

export function dealerNeedsLoungeScreen(
  dealer: Pick<DealerStaff, "state" | "tableNumber"> | null | undefined,
  tableNumber: number,
): boolean {
  if (!dealer) return false;
  return !dealerAssignedToTable(dealer, tableNumber);
}
