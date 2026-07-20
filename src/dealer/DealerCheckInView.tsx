import { useCallback, useEffect, useMemo, useState } from "react";
import { localApi } from "../config/api";
import { dealerHref } from "./dealerPaths";
import DealerAssignmentOverlay, { hasActiveDealerDuty } from "./DealerAssignmentOverlay";
import DealerLoungeStatus from "./DealerLoungeStatus";
import DealerPhoneSessionBar from "./DealerPhoneSessionBar";
import { formatPhoneDutyLabel, formatWelcomeMessage } from "./dealerDutyLabel";
import { readDealerIdentity, writeDealerIdentity } from "./dealerIdentity";
import { useDealerPhoneAction } from "./useDealerPhoneAction";

type ActiveStaff = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  state: string;
  tableNumber: number | null;
};

export default function DealerCheckInView() {
  const [staff, setStaff] = useState<ActiveStaff[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => readDealerIdentity()?.dealerId ?? null);
  const [loading, setLoading] = useState(true);
  const [overlayActive, setOverlayActive] = useState(false);

  const { action, dealer: me, serverTime, tBreakMinutes, tournamentBreak } = useDealerPhoneAction(selectedId, 1000);
  const dutyActive = hasActiveDealerDuty(action);

  const loadStaff = useCallback(async () => {
    const response = await fetch(localApi("/api/dealer-control/staff/active"));
    if (!response.ok) throw new Error("Unable to load dealer list.");
    const data = await response.json();
    setStaff(data.staff ?? []);
  }, []);

  useEffect(() => {
    void loadStaff().finally(() => setLoading(false));
  }, [loadStaff]);

  const handleSelectDealer = (dealerId: string) => {
    setSelectedId(dealerId || null);
    const entry = staff.find(s => s.id === dealerId);
    if (entry) {
      writeDealerIdentity({
        dealerId: entry.id,
        displayName: entry.displayName,
        role: entry.role,
        firstName: entry.firstName,
        lastName: entry.lastName,
      });
    }
  };

  const selected = staff.find(s => s.id === selectedId);

  const sessionStaff = useMemo(() => {
    if (me) {
      return {
        role: me.role,
        firstName: me.firstName,
        lastName: me.lastName,
      };
    }
    if (selected) {
      return {
        role: selected.role,
        firstName: selected.firstName,
        lastName: selected.lastName,
      };
    }
    if (selectedId) {
      const saved = readDealerIdentity();
      if (saved?.dealerId === selectedId) {
        return {
          role: saved.role,
          firstName: saved.firstName,
          lastName: saved.lastName,
        };
      }
    }
    return null;
  }, [me, selected, selectedId]);

  const dutyLabel = sessionStaff
    ? formatPhoneDutyLabel(sessionStaff, {
        tournamentBreakActive: tournamentBreak.active,
        returnTableNumber: me?.tableNumber ?? null,
      })
    : null;
  const showTableLink = !dutyActive && !overlayActive && !tournamentBreak.active
    && me?.state === "on_table" && me.tableNumber;
  const sessionOpen = Boolean(selectedId && sessionStaff);

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 px-4 ${sessionOpen ? "pt-14 pb-6" : "py-6"}`}>
      {dutyLabel && !overlayActive ? <DealerPhoneSessionBar dutyLabel={dutyLabel} /> : null}

      {selected ? (
        <DealerAssignmentOverlay
          dealerId={selected.id}
          displayName={selected.displayName}
          dutyLabel={dutyLabel}
          onActiveChange={setOverlayActive}
        />
      ) : null}

      {!dutyActive && !overlayActive ? (
        <div className="mx-auto max-w-lg space-y-4">
          <header className="rounded-3xl border border-amber-500/30 bg-zinc-900 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">Staff Check-In</p>
            <h1 className="mt-2 text-2xl font-black uppercase tracking-wider">Check In</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Scan the QR code, then select your name. Duty notifications appear on this screen.
            </p>
          </header>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading roster...</p>
          ) : (
            <label className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Your Name</span>
              <select
                value={selectedId ?? ""}
                onChange={(e) => handleSelectDealer(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm font-bold"
              >
                <option value="">Select staff member...</option>
                {staff.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selected && sessionStaff ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-5 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/90">Welcome</p>
                <p className="mt-3 text-lg font-bold leading-relaxed text-emerald-50">
                  {formatWelcomeMessage(sessionStaff)}
                </p>
              </div>

              {me ? (
                <DealerLoungeStatus
                  dealer={me}
                  serverTime={serverTime}
                  tBreakMinutes={tBreakMinutes}
                  tournamentBreakActive={tournamentBreak.active}
                  tournamentBreakEndAt={tournamentBreak.breakEndAt}
                />
              ) : null}

              {showTableLink ? (
                <a
                  href={dealerHref(`/dealer/${me!.tableNumber}?device=phone`)}
                  className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 py-3 text-center text-sm font-black uppercase tracking-wider text-zinc-200"
                >
                  Open Table Screen
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
