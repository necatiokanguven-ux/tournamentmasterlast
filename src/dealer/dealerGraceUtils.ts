import type { DealerStaff } from "../server/dealerRotation/types";

export function isDealerInPhoneGrace(dealer: DealerStaff, now = Date.now()): boolean {
  if (!dealer.phoneGraceUntil) return false;
  return new Date(dealer.phoneGraceUntil).getTime() > now;
}

export function phoneGraceRemainingMs(dealer: DealerStaff, now = Date.now()): number {
  if (!dealer.phoneGraceUntil) return 0;
  return Math.max(0, new Date(dealer.phoneGraceUntil).getTime() - now);
}
