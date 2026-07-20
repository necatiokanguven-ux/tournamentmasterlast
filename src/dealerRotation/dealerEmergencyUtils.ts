import type { DealerStaff } from "../server/dealerRotation/types";
import { isRotationDealer } from "./staffRoles";

export function hasPendingEmergency(
  dealer: Pick<DealerStaff, "emergencyCallAt" | "emergencyAckAt">,
): boolean {
  if (!dealer.emergencyCallAt) return false;
  if (!dealer.emergencyAckAt) return true;
  return new Date(dealer.emergencyAckAt).getTime() < new Date(dealer.emergencyCallAt).getTime();
}

export function isEmergencyCallable(dealer: Pick<DealerStaff, "active" | "state" | "role">): boolean {
  if (!dealer.active || !isRotationDealer(dealer)) return false;
  return ["on_break", "waiting", "ready", "pool", "standby"].includes(dealer.state);
}
