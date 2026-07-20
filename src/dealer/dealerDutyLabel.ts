import { formatStaffRoleLabel } from "../dealerRotation/staffRoles";
import type { DealerStaff } from "../server/dealerRotation/types";

export function staffDisplayName(staff: Pick<DealerStaff, "firstName" | "lastName">): string {
  return `${staff.firstName} ${staff.lastName}`.trim();
}

export function formatPhoneDutyLabel(
  staff: Pick<DealerStaff, "role" | "firstName" | "lastName">,
  options?: {
    tournamentBreakActive?: boolean;
    returnTableNumber?: number | null;
  },
): string {
  if (options?.tournamentBreakActive) {
    if (options.returnTableNumber) {
      return `Break — return to Table ${options.returnTableNumber}`;
    }
    return "Break — tournament rest";
  }

  const roleLabel = formatStaffRoleLabel(staff.role);
  const name = staffDisplayName(staff);
  return `Duty: ${roleLabel} ${name}`;
}

export function formatWelcomeMessage(staff: Pick<DealerStaff, "firstName" | "lastName">): string {
  const name = staffDisplayName(staff);
  return `Hello ${name}, best of luck on your shift.`;
}
