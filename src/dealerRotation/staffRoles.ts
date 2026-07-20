import type { DealerStaff } from "../server/dealerRotation/types";

export type StaffRolePresetId =
  | "dealer"
  | "manager"
  | "supervisor"
  | "floor"
  | "operator"
  | "cashier"
  | "custom";

export const PRESET_STAFF_ROLES: Array<{ id: StaffRolePresetId; label: string }> = [
  { id: "dealer", label: "Dealer" },
  { id: "manager", label: "Manager" },
  { id: "supervisor", label: "Supervisor" },
  { id: "floor", label: "Floor" },
  { id: "operator", label: "Operator" },
  { id: "cashier", label: "Cashier" },
  { id: "custom", label: "Custom" },
];

export function isRotationDealer(staff: Pick<DealerStaff, "role">): boolean {
  return staff.role === "dealer";
}

export function formatStaffRoleLabel(role: string): string {
  const preset = PRESET_STAFF_ROLES.find((entry) => entry.id === role);
  return preset?.label ?? role;
}

export function resolveStaffRole(preset: StaffRolePresetId, customRoleName: string): string {
  if (preset === "custom") {
    return customRoleName.trim();
  }
  return preset;
}
