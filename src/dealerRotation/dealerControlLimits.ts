/** Supported operational envelope for Dealer Control (single operator). */
export const DEALER_CONTROL_MAX_TABLES = 20;
export const DEALER_CONTROL_MIN_DEALERS = 25;

export function isDealerControlWithinLimits(tableCount: number, dealerCount: number): boolean {
  return tableCount <= DEALER_CONTROL_MAX_TABLES && dealerCount >= DEALER_CONTROL_MIN_DEALERS;
}
