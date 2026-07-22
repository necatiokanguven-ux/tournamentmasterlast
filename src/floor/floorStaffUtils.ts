import type { FloorTeam } from "../types";
import { dealerDisplayName } from "../server/dealerRotation/types";
import type { TournamentDatabase } from "../server/tournamentDatabase";

export function resolveFloorStaffDisplayName(
  db: TournamentDatabase,
  teamId: string,
): string | null {
  const teams = db.settings.floorTeams ?? [];
  const team = teams.find((t) => t.id === teamId);
  const rotation = db.dealerRotation;
  if (!rotation?.staff?.length) return null;

  const floorStaff = rotation.staff.filter(
    (s) => s.active && s.role === "floor",
  );

  if (team?.staffId) {
    const linked = floorStaff.find((s) => s.id === team.staffId);
    if (linked) return dealerDisplayName(linked);
  }

  const match = teamId.match(/^floor-(\d+)$/i);
  if (match) {
    const index = parseInt(match[1], 10) - 1;
    if (index >= 0 && index < floorStaff.length) {
      return dealerDisplayName(floorStaff[index]);
    }
  }

  if (floorStaff.length === 1) {
    return dealerDisplayName(floorStaff[0]);
  }

  return null;
}

/** Attach staffId to floor teams when saving from Personel Control */
export function enrichFloorTeamsWithStaffIds(
  teams: FloorTeam[],
  db: TournamentDatabase,
): FloorTeam[] {
  const rotation = db.dealerRotation;
  if (!rotation?.staff?.length) return teams;

  const floorStaff = rotation.staff.filter(
    (s) => s.active && s.role === "floor",
  );

  return teams.map((team) => {
    if (team.staffId && floorStaff.some((s) => s.id === team.staffId)) {
      return team;
    }
    const match = team.id.match(/^floor-(\d+)$/i);
    if (match) {
      const index = parseInt(match[1], 10) - 1;
      const staff = floorStaff[index];
      if (staff) {
        return { ...team, staffId: staff.id };
      }
    }
    return team;
  });
}
