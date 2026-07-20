import { useMemo } from "react";
import {
  formatSessionDuration,
  getSessionDealSeconds,
} from "../dealerRotation/dealerTimeUtils";
import { dealerDisplayName } from "../server/dealerRotation/types";
import type { DealerRotationSettings, DealerStaff } from "../server/dealerRotation/types";
import { isRotationDealer } from "../dealerRotation/staffRoles";

type DealerWorkHoursPanelProps = {
  staff: DealerStaff[];
  settings: DealerRotationSettings;
  liveNow: number;
};

type WorkRow = {
  id: string;
  name: string;
  totalSeconds: number;
  label: string;
  sessionLabel: string;
  rosterMinutes: number;
};

export default function DealerWorkHoursPanel({ staff, settings, liveNow }: DealerWorkHoursPanelProps) {
  const rows = useMemo(() => {
    return staff
      .filter((dealer) => dealer.active && isRotationDealer(dealer))
      .map((dealer): WorkRow => {
        const sessionSeconds = getSessionDealSeconds(dealer, liveNow, settings);
        const rosterSeconds = dealer.totalWorkMinutes * 60;
        const totalSeconds = rosterSeconds + sessionSeconds;

        return {
          id: dealer.id,
          name: dealerDisplayName(dealer),
          totalSeconds,
          label: formatSessionDuration(totalSeconds),
          sessionLabel: formatSessionDuration(sessionSeconds),
          rosterMinutes: dealer.totalWorkMinutes,
        };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [liveNow, settings, staff]);

  const maxSeconds = Math.max(...rows.map((row) => row.totalSeconds), 1);
  const grandTotal = rows.reduce((sum, row) => sum + row.totalSeconds, 0);

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No active dealers in roster.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total Deal Time (All Dealers)</p>
        <p className="mt-1 text-3xl font-black text-amber-400">{formatSessionDuration(grandTotal)}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Includes completed rotation blocks (roster total) plus live session deal time at each table.
          {settings.workHourAwareAssign ? (
            <span className="block mt-1 text-emerald-500/90">
              Work-hour aware assignment is ON — dealers with shorter bars are preferred for the next table.
            </span>
          ) : null}
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
                    Session: {row.sessionLabel} · Completed blocks: {row.rosterMinutes} min
                  </p>
                </div>
                <p className="text-lg font-black tabular-nums text-emerald-400">{row.label}</p>
              </div>
              <div className="mt-3 h-3 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-emerald-500 transition-all duration-500"
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
