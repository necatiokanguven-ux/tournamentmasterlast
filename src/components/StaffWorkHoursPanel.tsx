import { useMemo } from "react";
import { formatSessionDuration, getSupportStaffWorkSeconds } from "../dealerRotation/dealerTimeUtils";
import { formatStaffRoleLabel } from "../dealerRotation/staffRoles";
import { dealerDisplayName, type DealerStaff } from "../server/dealerRotation/types";
import { isRotationDealer } from "../dealerRotation/staffRoles";

type StaffWorkHoursPanelProps = {
  staff: DealerStaff[];
  liveNow: number;
};

type WorkRow = {
  id: string;
  name: string;
  role: string;
  totalSeconds: number;
  label: string;
  shiftActive: boolean;
};

export default function StaffWorkHoursPanel({ staff, liveNow }: StaffWorkHoursPanelProps) {
  const rows = useMemo(() => {
    return staff
      .filter((member) => member.active && !isRotationDealer(member))
      .map((member): WorkRow => {
        const sessionSeconds = getSupportStaffWorkSeconds(member, liveNow);
        const rosterSeconds = (member.totalStaffMinutes ?? 0) * 60;
        const totalSeconds = rosterSeconds + sessionSeconds;

        return {
          id: member.id,
          name: dealerDisplayName(member),
          role: formatStaffRoleLabel(member.role),
          totalSeconds,
          label: formatSessionDuration(totalSeconds),
          shiftActive: member.shiftActive,
        };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [liveNow, staff]);

  const maxSeconds = Math.max(...rows.map((row) => row.totalSeconds), 1);
  const grandTotal = rows.reduce((sum, row) => sum + row.totalSeconds, 0);

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No support staff in roster.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total Staff Time (Non-Dealer)</p>
        <p className="mt-1 text-3xl font-black text-sky-400">{formatSessionDuration(grandTotal)}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Tracks ON/OFF shift time for manager, floor, operator, and other support roles.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const widthPct = Math.max(4, Math.round((row.totalSeconds / maxSeconds) * 100));

          return (
            <div key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-zinc-100">{row.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {row.role} · {row.shiftActive ? "ON shift" : "OFF shift"}
                  </p>
                </div>
                <p className="text-lg font-black tabular-nums text-sky-300">{row.label}</p>
              </div>
              <div className="mt-3 h-3 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-700 to-sky-400 transition-all duration-500"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
