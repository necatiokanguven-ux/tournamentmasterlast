import { useCallback, useEffect, useMemo, useState } from "react";
import { localApi } from "../config/api";
import { dealerHref } from "./dealerPaths";
import DealerAssignmentOverlay from "./DealerAssignmentOverlay";
import DealerLoungeStatus from "./DealerLoungeStatus";
import DealerPhoneSessionBar from "./DealerPhoneSessionBar";
import { formatPhoneDutyLabel, formatWelcomeMessage } from "./dealerDutyLabel";
import { readDealerIdentity, switchDealerIdentity, writeDealerIdentity } from "./dealerIdentity";
import { writeStoredConfig } from "./DealerSetupView";
import { dealerAssignedToTable } from "./dealerTableAccess";
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
  const [switching, setSwitching] = useState(false);

  const { action, dealer: me, serverTime, tBreakMinutes, tDealMinutes, tournamentBreak } =
    useDealerPhoneAction(selectedId, 1000);

  const loadStaff = useCallback(async () => {
    const response = await fetch(localApi("/api/dealer-control/staff/active"));
    if (!response.ok) throw new Error("Unable to load dealer list.");
    const data = await response.json();
    setStaff(data.staff ?? []);
  }, []);

  useEffect(() => {
    void loadStaff().finally(() => setLoading(false));
  }, [loadStaff]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("switch") !== "1") return;

    setSwitching(true);
    void switchDealerIdentity().then(() => {
      setSelectedId(null);
      window.history.replaceState({}, "", dealerHref("/dealer/checkin"));
      setSwitching(false);
    });
  }, []);

  const handleSelectDealer = async (dealerId: string) => {
    if (!dealerId) {
      await switchDealerIdentity();
      setSelectedId(null);
      return;
    }

    if (selectedId && selectedId !== dealerId) {
      await switchDealerIdentity();
    }

    setSelectedId(dealerId);
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

  const handleChangeDealer = async () => {
    setSwitching(true);
    await switchDealerIdentity();
    setSelectedId(null);
    setSwitching(false);
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
  const showTableLink = !overlayActive && !tournamentBreak.active
    && me?.tableNumber != null
    && dealerAssignedToTable(me, me.tableNumber);

  const handleOpenTableScreen = () => {
    if (!me?.tableNumber) return;
    writeStoredConfig({
      tableNumber: me.tableNumber,
      setupLocked: true,
      deviceType: "phone",
    });
    window.location.assign(dealerHref(`/dealer/${me.tableNumber}?device=phone`));
  };
  const sessionOpen = Boolean(selectedId && sessionStaff);
  const changeDealerHref = dealerHref("/dealer/checkin?switch=1");

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 px-4 ${sessionOpen ? "pt-14 pb-6" : "py-6"}`}>
      {dutyLabel && !overlayActive ? (
        <DealerPhoneSessionBar
          dutyLabel={dutyLabel}
          changeDealerHref={changeDealerHref}
          onChangeDealer={() => void handleChangeDealer()}
        />
      ) : null}

      {selected ? (
        <DealerAssignmentOverlay
          dealerId={selected.id}
          displayName={selected.displayName}
          dutyLabel={dutyLabel}
          changeDealerHref={changeDealerHref}
          onActiveChange={setOverlayActive}
        />
      ) : null}

      {!overlayActive ? (
        <div className="mx-auto max-w-lg space-y-4">
          <header className="rounded-3xl border border-amber-500/30 bg-zinc-900 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">Staff Check-In</p>
            <h1 className="mt-2 text-2xl font-black uppercase tracking-wider">Check In</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Scan the QR code, then select your name. Duty notifications appear on this screen.
            </p>
          </header>

          {action.kind === "upcoming_task" ? (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/15 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Upcoming Task</p>
              <p className="mt-2 text-base font-black uppercase tracking-wide text-amber-100">
                {action.taskKind === "table_deal" && action.tableNumber != null
                  ? `Table ${action.tableNumber} deal`
                  : action.taskKind === "return_to_table" && action.tableNumber != null
                    ? `Return to Table ${action.tableNumber}`
                    : action.taskKind === "rotation_end" && action.tableNumber != null
                      ? `Table ${action.tableNumber} rotation ends`
                      : action.tableNumber != null
                        ? `Table ${action.tableNumber}`
                        : "Upcoming assignment"}
              </p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-amber-50">{action.message}</p>
            </div>
          ) : null}

          {loading || switching ? (
            <p className="text-sm text-zinc-500">{switching ? "Switching dealer..." : "Loading roster..."}</p>
          ) : (
            <label className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Your Name</span>
              <select
                value={selectedId ?? ""}
                onChange={(e) => void handleSelectDealer(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm font-bold"
              >
                <option value="">Select staff member...</option>
                {staff.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
              {selectedId ? (
                <button
                  type="button"
                  onClick={() => void handleChangeDealer()}
                  className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
                >
                  Wrong person? Clear and reselect
                </button>
              ) : null}
            </label>
          )}

          {selected && sessionStaff ? (
            <div className="space-y-3">
              {showTableLink ? (
                <button
                  type="button"
                  onClick={handleOpenTableScreen}
                  className="block w-full rounded-2xl border border-emerald-400/50 bg-emerald-500 py-4 text-center text-base font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-500/20"
                >
                  Open Table {me!.tableNumber}
                </button>
              ) : null}

              {me ? (
                <DealerLoungeStatus
                  dealer={me}
                  serverTime={serverTime}
                  tBreakMinutes={tBreakMinutes}
                  tDealMinutes={tDealMinutes}
                  tournamentBreakActive={tournamentBreak.active}
                  tournamentBreakEndAt={tournamentBreak.breakEndAt}
                />
              ) : null}

              <p className="text-center text-xs text-zinc-500 px-2">
                {formatWelcomeMessage(sessionStaff)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
