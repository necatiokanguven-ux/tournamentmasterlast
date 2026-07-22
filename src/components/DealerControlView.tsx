import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Users,
  Settings2,
  Activity,
  QrCode,
  FileText,
  Play,
  UserPlus,
  Trash2,
  ListOrdered,
  Siren,
  BarChart3,
  AlertTriangle,
  X,
  Layers,
  PhoneCall,
} from "lucide-react";
import { useDealerControl } from "../dealerRotation/useDealerControl";
import { syncDealerControlTablesWithTournament } from "../dealerRotation/dealerControlTableSync";
import { useTournament } from "../useTournament";
import { isDealerInPhoneGrace, phoneGraceRemainingMs } from "../dealer/dealerGraceUtils";
import DealerZoneSetupModal from "./DealerZoneSetupModal";
import {
  estimateMobileDeviceCount,
  exceedsVenuePackageLimits,
  getActiveVenuePackageId,
} from "../dealerRotation/venuePackageTiers";
import DealerWorkHoursPanel from "./DealerWorkHoursPanel";
import StaffWorkHoursPanel from "./StaffWorkHoursPanel";
import DealerControlStatusPanel from "./DealerControlStatusPanel";
import DealerControlPackagePanel from "./DealerControlPackagePanel";
import FloorSetupModal from "./FloorSetupModal";
import {
  PRESET_STAFF_ROLES,
  formatStaffRoleLabel,
  isRotationDealer,
  type StaffRolePresetId,
} from "../dealerRotation/staffRoles";
import {
  formatSessionDuration,
  formatTableDealDuration,
  getCurrentTableDealSeconds,
  getDealRemainingSeconds,
  getSessionBreakSeconds,
  getSessionDealSeconds,
  getSupportStaffWorkSeconds,
} from "../dealerRotation/dealerTimeUtils";
import { hasPendingEmergency, isEmergencyCallable } from "../dealerRotation/dealerEmergencyUtils";
import { useLiveSecond } from "../dealerRotation/useLiveSecond";
import { dealerDisplayName } from "../server/dealerRotation/types";
import type { DealerStaff } from "../server/dealerRotation/types";

type Tab = "live" | "roster" | "settings" | "qr" | "reports" | "hours";

const T_DEAL_PRESETS = [20, 30, 45];

function presetButtonClass(active: boolean): string {
  return `px-3 py-2 rounded-xl text-xs font-black uppercase transition-colors ${
    active ? "bg-amber-500 text-black ring-2 ring-amber-300/60" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
  }`;
}

function EmergencyCallButton({
  dealer,
  onCall,
}: {
  dealer: DealerStaff;
  onCall: () => void;
}) {
  if (!isEmergencyCallable(dealer)) return null;

  const pending = hasPendingEmergency(dealer);

  return (
    <button
      type="button"
      onClick={onCall}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
        pending
          ? "bg-red-500/30 text-red-200 animate-pulse"
          : "bg-red-600 hover:bg-red-500 text-white"
      }`}
    >
      <Siren className="w-3 h-3" />
      {pending ? "Call Sent" : "Emergency Call"}
    </button>
  );
}

export default function DealerControlView() {
  const {
    state,
    loading,
    error,
    saveSettings,
    addStaff,
    removeStaff,
    initialize,
    assignDealer,
    moveToWaiting,
    sendToBreak,
    sendToPool,
    emergencyCall,
    setStaffShift,
    dismissOperatorAlert,
    setStaffZone,
  } = useDealerControl();
  const { state: tournamentState, saveDealerZones, saveFloorTeams } = useTournament();

  const liveNow = useLiveSecond();

  const [tab, setTab] = useState<Tab>("live");
  const [zoneSetupOpen, setZoneSetupOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    maxWorkMinutes: 480,
    acceptsOvertime: false,
    rolePreset: "dealer" as StaffRolePresetId,
    customRole: "",
    zoneId: "",
  });
  const [customTDeal, setCustomTDeal] = useState("");
  const [tBreakDraft, setTBreakDraft] = useState("30");
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [assignDealerId, setAssignDealerId] = useState("");
  const [assignTableId, setAssignTableId] = useState("");
  const [level1ConfirmOpen, setLevel1ConfirmOpen] = useState(false);
  const [floorSetupOpen, setFloorSetupOpen] = useState(false);
  const [floorSetupTeamCount, setFloorSetupTeamCount] = useState(1);
  const [floorSetupAutoQrTeamId, setFloorSetupAutoQrTeamId] = useState<string | null>(null);

  const { rotation, tables: dealerTables, checkInUrl, serverTime, coverageSummary, dealerZones, zonesEnabled } = state;

  const liveTables = useMemo(
    () => syncDealerControlTablesWithTournament(
      tournamentState.tables,
      dealerTables,
      rotation.settings.enabled,
    ),
    [tournamentState.tables, dealerTables, rotation.settings.enabled],
  );

  const activeTableNumbers = useMemo(
    () => new Set(tournamentState.tables.map(table => table.number)),
    [tournamentState.tables],
  );

  const liveOperatorAlerts = useMemo(
    () => (rotation.operatorAlerts ?? []).filter(alert => {
      if (alert.type !== "UNCOVERED_TABLE") return true;
      return alert.tableNumber == null || activeTableNumbers.has(alert.tableNumber);
    }),
    [rotation.operatorAlerts, activeTableNumbers],
  );

  const liveCoverageSummary = useMemo(() => {
    if (!coverageSummary) return null;

    const uncoveredTableNumbers = coverageSummary.uncoveredTableNumbers.filter(number =>
      activeTableNumbers.has(number),
    );

    return {
      ...coverageSummary,
      activeTableCount: liveTables.length,
      uncoveredTableNumbers,
      hasCriticalAlert: uncoveredTableNumbers.length > 0,
      hasStaffingWarning: coverageSummary.hasStaffingWarning && liveTables.length > 0,
    };
  }, [coverageSummary, activeTableNumbers, liveTables.length]);
  const configuredZones = dealerZones.length > 0 ? dealerZones : (tournamentState.settings.dealerZones ?? []);
  const activeStaff = rotation.staff.filter(s => s.active && isRotationDealer(s));
  const inactiveDealers = useMemo(
    () => rotation.staff.filter(isEmergencyCallable).sort((a, b) => dealerDisplayName(a).localeCompare(dealerDisplayName(b))),
    [rotation.staff],
  );
  const activeTDeal = rotation.settings.tDealMinutes;
  const isCustomTDealActive = !T_DEAL_PRESETS.includes(activeTDeal);

  useEffect(() => {
    setTBreakDraft(String(rotation.settings.tBreakMinutes));
  }, [rotation.settings.tBreakMinutes]);

  useEffect(() => {
    if (isCustomTDealActive) {
      setCustomTDeal(String(activeTDeal));
    }
  }, [activeTDeal, isCustomTDealActive]);

  const showSettingsNotice = (message: string) => {
    setSettingsNotice(message);
    window.setTimeout(() => setSettingsNotice(null), 9000);
  };

  const stats = useMemo(() => {
    const onTable = rotation.staff.filter(s => s.state === "on_table" || s.state === "incoming").length;
    const needs = liveTables.filter(t => t.needsDealer).length;
    const onBreak = rotation.staff.filter(s => s.state === "on_break").length;
    const waiting = rotation.waitingList.length;
    const dtShortfall = liveCoverageSummary?.dealerShortfall ?? 0;
    const dtOk = liveCoverageSummary?.staffingRatioOk ?? true;
    return { onTable, needs, onBreak, waiting, dtShortfall, dtOk };
  }, [rotation, liveTables, liveCoverageSummary]);

  const tableCount = liveTables.length;
  const rotationDealerCount = activeStaff.length;
  const activePlayerCount = tournamentState.players.filter(
    (player) => player.status === "Playing" || player.status === "Waiting",
  ).length;
  const mobileDeviceCount = estimateMobileDeviceCount(activePlayerCount, rotationDealerCount);
  const limitSnapshot = { tableCount, mobileDeviceCount };
  const exceedsPackageLimits = exceedsVenuePackageLimits(getActiveVenuePackageId(), limitSnapshot);

  const runProtectedAction = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (actionError) {
      showSettingsNotice(actionError instanceof Error ? actionError.message : `${label} failed.`);
    }
  };

  const handleAddStaff = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    if (form.rolePreset === "custom" && !form.customRole.trim()) {
      showSettingsNotice("Enter a custom role name.");
      return;
    }

    const addedRole = form.rolePreset;
    const nextFloorStaffCount = rotation.staff.filter(
      (member) => member.active && member.role === "floor",
    ).length + (addedRole === "floor" ? 1 : 0);

    await addStaff({
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      maxWorkMinutes: form.maxWorkMinutes,
      acceptsOvertime: form.acceptsOvertime,
      rolePreset: form.rolePreset,
      customRole: form.customRole,
      zoneId: form.zoneId || null,
    });

    if (addedRole === "floor") {
      const teamCount = Math.max(
        nextFloorStaffCount,
        tournamentState.settings.floorTeams?.length ?? 0,
        1,
      );
      setFloorSetupTeamCount(teamCount);
      setFloorSetupAutoQrTeamId(`floor-${nextFloorStaffCount}`);
      setFloorSetupOpen(true);
      setTab("roster");
      showSettingsNotice("Floor staff added — assign responsible tables, then scan Floor QR on the phone.");
    }

    setForm({
      firstName: "",
      lastName: "",
      phone: "",
      maxWorkMinutes: 480,
      acceptsOvertime: false,
      rolePreset: "dealer",
      customRole: "",
      zoneId: "",
    });
  };

  const handleTDeal = async (minutes: number) => {
    await saveSettings({ tDealMinutes: minutes });
    showSettingsNotice(
      `Deal time set to ${minutes} min. New assignments and rotations use this duration; dealers already at a table keep their current timer until the next change.`,
    );
  };

  const handleCustomTDeal = async () => {
    const value = Number.parseInt(customTDeal, 10);
    if (!Number.isFinite(value) || value <= 0) {
      showSettingsNotice("Enter a valid custom deal time in minutes.");
      return;
    }
    await saveSettings({ tDealMinutes: value });
    showSettingsNotice(
      `Custom deal time ${value} min is active. New assignments and rotations use this duration; current table timers are unchanged.`,
    );
  };

  const handleEnabledChange = async (checked: boolean) => {
    if (checked && activeStaff.length === 0) {
      showSettingsNotice("Rotation enabled, but no active dealers in roster — add dealers first.");
    }
    await saveSettings({ enabled: checked });
    if (!checked) {
      showSettingsNotice("Automatic rotation paused. Manual assignments in Live still work.");
    } else if (activeStaff.length > 0) {
      showSettingsNotice("Automatic rotation is ON. Dealers rotate after the active deal time.");
    }
  };

  const handleAutoAssignChange = async (checked: boolean) => {
    await saveSettings({ autoAssign: checked });
    showSettingsNotice(
      checked
        ? "Auto-assign ON — empty tables are filled from the dealer pool automatically."
        : "Auto-assign OFF — assign dealers manually from the Live tab.",
    );
  };

  const handleHandoffFrozenChange = async (checked: boolean) => {
    await saveSettings({ handoffFrozen: checked });
    showSettingsNotice(
      checked
        ? "Handoff freeze ON — dealers stay on their tables; deal-time rotations are paused."
        : "Handoff freeze OFF — normal table rotations resume on the next tick.",
    );
  };

  const handleWorkHourAwareChange = async (checked: boolean) => {
    await saveSettings({ workHourAwareAssign: checked });
    showSettingsNotice(
      checked
        ? "Work-hour aware assignment ON — pool picks favor dealers with fewer deal minutes."
        : "Work-hour aware assignment OFF — classic FIFO pool order is used.",
    );
  };

  const handleLevel1FairOrderChange = async (checked: boolean) => {
    await saveSettings({ level1FairOrder: checked });
    showSettingsNotice(
      checked
        ? "Level 1 fair order ON — Level 1 Distribute assigns tables to dealers with the least hours first."
        : "Level 1 fair order OFF — Level 1 uses roster list order.",
    );
  };

  const handleDismissAlert = async (fingerprint: string) => {
    try {
      await dismissOperatorAlert(fingerprint);
    } catch (dismissError) {
      showSettingsNotice(dismissError instanceof Error ? dismissError.message : "Could not dismiss alert.");
    }
  };

  const handleApplyBreak = async () => {
    const value = Number.parseInt(tBreakDraft, 10);
    if (!Number.isFinite(value) || value <= 0) {
      showSettingsNotice("Enter a valid break duration in minutes.");
      return;
    }
    await saveSettings({ tBreakMinutes: value });
    showSettingsNotice(
      `Break time set to ${value} min. Applies when the next dealer goes on break.`,
    );
  };

  const handleConfirmLevel1Distribute = async () => {
    setLevel1ConfirmOpen(false);
    try {
      await initialize();
      showSettingsNotice("Level 1 Distribute completed — dealers assigned to tables.");
    } catch (initError) {
      showSettingsNotice(initError instanceof Error ? initError.message : "Level 1 Distribute failed.");
    }
  };

  const staffById = (id: string): DealerStaff | undefined => rotation.staff.find(s => s.id === id);

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "live", label: "Live", icon: Activity },
    { id: "roster", label: "Roster", icon: Users },
    { id: "settings", label: "Schedule", icon: Settings2 },
    { id: "qr", label: "Lounge QR", icon: QrCode },
    { id: "reports", label: "Work Log", icon: FileText },
    { id: "hours", label: "Work Hours", icon: BarChart3 },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-black uppercase tracking-wider text-zinc-100">Personel Control</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage dealer roster, floor teams, rotation, pool assignments, and lounge check-in.
        </p>
      </header>

      <DealerControlPackagePanel limitSnapshot={limitSnapshot} />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {settingsNotice ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {settingsNotice}
        </div>
      ) : null}

      <DealerControlStatusPanel
        enabled={rotation.settings.enabled && !exceedsPackageLimits}
        handoffFrozen={rotation.settings.handoffFrozen}
        workHourAwareAssign={rotation.settings.workHourAwareAssign}
        coverageSummary={liveCoverageSummary}
        operatorAlerts={liveOperatorAlerts}
        dismissedAlertKeys={rotation.dismissedOperatorAlertKeys ?? []}
        tDealMinutes={rotation.settings.tDealMinutes}
        tBreakMinutes={rotation.settings.tBreakMinutes}
        onDismissAlert={(fingerprint) => void handleDismissAlert(fingerprint)}
      />

      {exceedsPackageLimits ? (
        <p className="text-xs font-bold uppercase tracking-wider text-red-300" role="alert">
          Dealer Control is locked — disable this module and continue with QR Live Tracking only.
        </p>
      ) : null}

      <div
        className={exceedsPackageLimits ? "pointer-events-none opacity-35 select-none" : undefined}
        aria-hidden={exceedsPackageLimits}
      >

      {loading ? <p className="text-xs text-zinc-500 uppercase tracking-wider">Loading...</p> : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "On Table", value: stats.onTable, tone: "text-emerald-400" },
          { label: "Needs Dealer", value: stats.needs, tone: stats.needs > 0 ? "text-red-400 animate-pulse" : "text-red-400" },
          { label: "Dealer/Table", value: stats.dtOk ? "OK" : `−${stats.dtShortfall}`, tone: stats.dtOk ? "text-emerald-400" : "text-red-400 animate-pulse" },
          { label: "On Break", value: stats.onBreak, tone: "text-amber-400" },
          { label: "Waiting", value: stats.waiting, tone: "text-sky-400" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{card.label}</p>
            <p className={`text-2xl font-black ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
              tab === id
                ? "bg-amber-500 text-black"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLevel1ConfirmOpen(true)}
          className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"
        >
          <Play className="w-4 h-4" />
          Level 1 Distribute
        </button>
      </div>

      {level1ConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <button
              type="button"
              onClick={() => setLevel1ConfirmOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pr-8">
              <AlertTriangle className="w-6 h-6 shrink-0 text-amber-400" />
              <h3 className="text-lg font-black uppercase tracking-wider text-zinc-100">
                Level 1 Distribute
              </h3>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed">
              This button is for the initial dealer assignment only — it automatically seats dealers at
              active tables and resets the rotation pool.
            </p>
            <p className="text-sm text-amber-200/90 leading-relaxed">
              Using it while the tournament is in progress is not recommended. It will clear current
              table assignments and restart dealer placement.
            </p>
            <p className="text-sm font-bold text-zinc-200">Do you want to continue?</p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLevel1ConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black uppercase tracking-wider transition"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmLevel1Distribute()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "live" ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">Table Assignments</h2>
            {liveTables.length === 0 ? (
              <p className="text-xs text-zinc-500 leading-relaxed py-6 text-center">
                No active tables. Open tables from the Tables menu — they will appear here automatically.
              </p>
            ) : null}
            {liveTables.map((table) => {
              const staff = table.dealerId
                ? rotation.staff.find(s => s.id === table.dealerId)
                : undefined;
              const tableDeal = staff
                ? formatSessionDuration(getCurrentTableDealSeconds(staff, liveNow, rotation.settings))
                : null;
              const dealRemaining = staff ? getDealRemainingSeconds(staff, liveNow) : null;

              return (
              <div
                key={table.id}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  table.needsDealer
                    ? "border-red-500/50 bg-red-500/10 animate-pulse"
                    : "border-zinc-800 bg-zinc-950"
                }`}
              >
                <div>
                  <p className="text-sm font-black text-amber-400">Table {table.number}</p>
                  <p className="text-xs text-zinc-400">{table.dealerName ?? "No dealer assigned"}</p>
                  {tableDeal ? (
                    <p className="text-[10px] text-emerald-400/90 font-mono mt-0.5">This table: {tableDeal}</p>
                  ) : null}
                  {dealRemaining != null && staff?.state === "on_table" ? (
                    <p className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                      Next rotation in: {formatTableDealDuration(dealRemaining)}
                    </p>
                  ) : null}
                </div>
                {table.needsDealer ? (
                  <span className="text-[10px] font-black uppercase text-red-300">Needs Dealer</span>
                ) : null}
              </div>
            );
            })}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">Manual Assign</h2>
            <select
              value={assignDealerId}
              onChange={(e) => setAssignDealerId(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="">Select dealer...</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {dealerDisplayName(s)} ({s.state})
                </option>
              ))}
            </select>
            <select
              value={assignTableId}
              onChange={(e) => setAssignTableId(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="">Select table...</option>
              {liveTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.number}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!assignDealerId || !assignTableId}
              onClick={() => void assignDealer(assignDealerId, assignTableId)}
              className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 py-2 text-xs font-black uppercase text-white disabled:opacity-40"
            >
              Assign Dealer to Table
            </button>

            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 pt-2">Waiting List</h2>
            {rotation.waitingList.length === 0 ? (
              <p className="text-xs text-zinc-500">No dealers in waiting list.</p>
            ) : (
              rotation.waitingList.map((id) => {
                const dealer = staffById(id);
                if (!dealer) return null;
                return (
                  <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                    <span className="text-sm font-bold flex-1">{dealerDisplayName(dealer)}</span>
                    <EmergencyCallButton dealer={dealer} onCall={() => void emergencyCall(id)} />
                    <button type="button" onClick={() => void runProtectedAction("Move to pool", () => sendToPool(id))} className="px-2 py-1 rounded-lg bg-zinc-800 text-[10px] font-bold uppercase">
                      Staff Pool
                    </button>
                    <button type="button" onClick={() => void runProtectedAction("Send to break", () => sendToBreak(id))} className="px-2 py-1 rounded-lg bg-amber-500/20 text-[10px] font-bold uppercase text-amber-300">
                      Break
                    </button>
                  </div>
                );
              })
            )}

            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 pt-2">Staff Pool Queue</h2>
            {rotation.poolQueue.length === 0 ? (
              <p className="text-xs text-zinc-500">Pool empty.</p>
            ) : (
              rotation.poolQueue.map((id) => {
                const dealer = staffById(id);
                if (!dealer) return null;
                return (
                  <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                    <span className="text-sm font-bold flex-1">{dealerDisplayName(dealer)}</span>
                    <span className="text-[10px] uppercase text-zinc-500">{dealer.state}</span>
                    <EmergencyCallButton dealer={dealer} onCall={() => void emergencyCall(id)} />
                  </div>
                );
              })
            )}

            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 pt-2 flex items-center gap-2">
              <Siren className="w-4 h-4 text-red-400" />
              Inactive Dealers — Emergency Call
            </h2>
            {inactiveDealers.length === 0 ? (
              <p className="text-xs text-zinc-500">No inactive dealers available for emergency call.</p>
            ) : (
              inactiveDealers.map((dealer) => (
                <div key={dealer.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{dealerDisplayName(dealer)}</p>
                    <p className="text-[10px] uppercase text-zinc-500">{dealer.state}</p>
                  </div>
                  <EmergencyCallButton dealer={dealer} onCall={() => void emergencyCall(dealer.id)} />
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}

      {tab === "roster" ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-orange-300 flex items-center gap-2">
                <PhoneCall className="w-4 h-4" /> Floor Teams
              </h2>
              <p className="text-[11px] text-zinc-400 mt-1">
                Assign tables to floor teams and open Floor QR so each floor phone can register.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const floorStaffCount = rotation.staff.filter((member) => member.active && member.role === "floor").length;
                const teamCount = Math.max(floorStaffCount, tournamentState.settings.floorTeams?.length ?? 0, 1);
                setFloorSetupTeamCount(teamCount);
                setFloorSetupAutoQrTeamId(null);
                setFloorSetupOpen(true);
              }}
              className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-[10px] font-black uppercase text-orange-300"
            >
              Open Floor Setup
            </button>
          </section>

        <div className="grid lg:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Add Staff
            </h2>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Role</span>
              <select
                value={form.rolePreset}
                onChange={(e) => setForm((f) => ({ ...f, rolePreset: e.target.value as StaffRolePresetId }))}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-bold"
              >
                {PRESET_STAFF_ROLES.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            {(rotation.settings.customStaffRoles ?? []).length > 0 ? (
              <p className="text-[10px] text-zinc-500">
                Saved custom roles: {(rotation.settings.customStaffRoles ?? []).join(", ")}
              </p>
            ) : null}
            {form.rolePreset === "custom" ? (
              <input
                placeholder="Custom role name"
                value={form.customRole}
                onChange={(e) => setForm((f) => ({ ...f, customRole: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            ) : null}
            <input
              placeholder="First name"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            {form.rolePreset === "dealer" && configuredZones.length > 0 ? (
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dealer zone</span>
                <select
                  value={form.zoneId}
                  onChange={(e) => setForm((f) => ({ ...f, zoneId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-bold"
                >
                  <option value="">Unassigned</option>
                  {configuredZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {form.rolePreset === "dealer" ? (
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                Max work (minutes):
                <input
                  type="number"
                  value={form.maxWorkMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, maxWorkMinutes: Number(e.target.value) || 480 }))}
                  className="w-24 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
                />
              </label>
            ) : null}
            {form.rolePreset === "dealer" ? (
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={form.acceptsOvertime}
                  onChange={(e) => setForm((f) => ({ ...f, acceptsOvertime: e.target.checked }))}
                />
                Accepts overtime
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => void handleAddStaff()}
              className="w-full rounded-xl bg-amber-500 py-2 text-xs font-black uppercase text-black"
            >
              {form.rolePreset === "dealer" ? "Add to Pool" : "Add Staff"}
            </button>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">Registered Staff</h2>
            {rotation.staff.map((member) => {
              const isDealer = isRotationDealer(member);
              const inPhoneGrace = isDealerInPhoneGrace(member, liveNow);
              const graceSeconds = inPhoneGrace ? Math.ceil(phoneGraceRemainingMs(member, liveNow) / 1000) : 0;
              const sessionDeal = formatSessionDuration(getSessionDealSeconds(member, liveNow, rotation.settings));
              const sessionBreak = formatSessionDuration(getSessionBreakSeconds(member, liveNow, rotation.settings));
              const staffWork = formatSessionDuration(getSupportStaffWorkSeconds(member, liveNow));
              const atTable = member.tableId
                ? formatSessionDuration(getCurrentTableDealSeconds(member, liveNow, rotation.settings))
                : null;

              return (
              <div key={member.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{dealerDisplayName(member)}</p>
                    {inPhoneGrace ? (
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-300 mt-0.5">
                        Phone grace · {graceSeconds}s
                      </p>
                    ) : null}
                    <p className="text-[10px] text-amber-400/90 uppercase">{formatStaffRoleLabel(member.role)}</p>
                    {isDealer ? (
                      <>
                        <p className="text-[10px] text-zinc-500">
                          {member.state}
                          {member.tableNumber ? ` · Table ${member.tableNumber}` : ""}
                          {member.zoneId && configuredZones.length > 0
                            ? ` · ${configuredZones.find(zone => zone.id === member.zoneId)?.name ?? member.zoneId}`
                            : ""}
                          · {member.totalWorkMinutes}/{member.maxWorkMinutes} min total
                          {member.totalWorkMinutes >= member.maxWorkMinutes ? " · OVERTIME LIMIT" : ""}
                        </p>
                        <p className="text-[10px] text-emerald-400/90 font-mono mt-1">
                          Session deal: {sessionDeal} · Break: {sessionBreak}
                          {atTable ? ` · At table: ${atTable}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-[10px] text-sky-400/90 font-mono mt-1">
                        Shift: {member.shiftActive ? "ON" : "OFF"} · Work time: {staffWork}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => void runProtectedAction("Remove staff", () => removeStaff(member.id))} className="text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {isDealer ? (
                  <div className="flex flex-wrap gap-1">
                    {configuredZones.length > 0 ? (
                      <select
                        value={member.zoneId ?? ""}
                        onChange={(event) => void runProtectedAction(
                          "Update zone",
                          () => setStaffZone(member.id, event.target.value || null),
                        )}
                        className="rounded bg-zinc-800 px-2 py-1 text-[9px] font-bold uppercase"
                      >
                        <option value="">Zone</option>
                        {configuredZones.map((zone) => (
                          <option key={zone.id} value={zone.id}>{zone.name}</option>
                        ))}
                      </select>
                    ) : null}
                    <EmergencyCallButton dealer={member} onCall={() => void emergencyCall(member.id)} />
                    <button type="button" onClick={() => void runProtectedAction("Move to waiting", () => moveToWaiting(member.id))} className="px-2 py-1 rounded bg-zinc-800 text-[9px] font-bold uppercase">
                      Waiting
                    </button>
                    <button type="button" onClick={() => void runProtectedAction("Send to break", () => sendToBreak(member.id))} className="px-2 py-1 rounded bg-zinc-800 text-[9px] font-bold uppercase">
                      Break
                    </button>
                    <button type="button" onClick={() => void runProtectedAction("Send to pool", () => sendToPool(member.id))} className="px-2 py-1 rounded bg-zinc-800 text-[9px] font-bold uppercase">
                      Pool
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => void setStaffShift(member.id, true)}
                      disabled={member.shiftActive}
                      className="px-2 py-1 rounded bg-emerald-600 text-[9px] font-bold uppercase text-white disabled:opacity-40"
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      onClick={() => void setStaffShift(member.id, false)}
                      disabled={!member.shiftActive}
                      className="px-2 py-1 rounded bg-zinc-700 text-[9px] font-bold uppercase disabled:opacity-40"
                    >
                      OFF
                    </button>
                    {member.role === "floor" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const floorIndex = rotation.staff
                            .filter((entry) => entry.active && entry.role === "floor")
                            .findIndex((entry) => entry.id === member.id);
                          const teamId = `floor-${Math.max(floorIndex + 1, 1)}`;
                          const teamCount = Math.max(
                            rotation.staff.filter((entry) => entry.active && entry.role === "floor").length,
                            tournamentState.settings.floorTeams?.length ?? 0,
                            1,
                          );
                          setFloorSetupTeamCount(teamCount);
                          setFloorSetupAutoQrTeamId(teamId);
                          setFloorSetupOpen(true);
                        }}
                        className="px-2 py-1 rounded bg-orange-500/15 border border-orange-500/30 text-[9px] font-bold uppercase text-orange-300"
                      >
                        Floor Tables / QR
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
            })}
          </section>
        </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-5 max-w-xl">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Active Schedule</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-zinc-500">Rotation</span>
                <p className={`font-black uppercase ${rotation.settings.enabled ? "text-emerald-400" : "text-zinc-400"}`}>
                  {rotation.settings.enabled ? "ON" : "OFF"}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Auto-assign</span>
                <p className={`font-black uppercase ${rotation.settings.autoAssign ? "text-emerald-400" : "text-zinc-400"}`}>
                  {rotation.settings.autoAssign ? "ON" : "OFF"}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Handoff freeze</span>
                <p className={`font-black uppercase ${rotation.settings.handoffFrozen ? "text-sky-400" : "text-zinc-400"}`}>
                  {rotation.settings.handoffFrozen ? "ON" : "OFF"}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Fair assign</span>
                <p className={`font-black uppercase ${rotation.settings.workHourAwareAssign ? "text-emerald-400" : "text-zinc-400"}`}>
                  {rotation.settings.workHourAwareAssign ? "ON" : "OFF"}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Level 1 fair</span>
                <p className={`font-black uppercase ${rotation.settings.level1FairOrder ? "text-emerald-400" : "text-zinc-400"}`}>
                  {rotation.settings.level1FairOrder ? "ON" : "OFF"}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Deal time</span>
                <p className="font-black text-amber-400">
                  {activeTDeal} min{isCustomTDealActive ? " (custom)" : ""}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Break time</span>
                <p className="font-black text-amber-400">{rotation.settings.tBreakMinutes} min</p>
              </div>
            </div>
            <p className="text-[10px] text-zinc-600 pt-1">
              Server sync: {new Date(serverTime).toLocaleTimeString()}
            </p>
          </div>

          {settingsNotice ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {settingsNotice}
            </p>
          ) : null}

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-zinc-200">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-black uppercase tracking-wider">Dealer Zones</h3>
              </div>
              <button
                type="button"
                onClick={() => setZoneSetupOpen(true)}
                className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[10px] font-black uppercase text-sky-300"
              >
                Configure Zones
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              {zonesEnabled
                ? "Zone mode is active on the server. Use ?zone=zone-1 in the URL for per-zone operator views."
                : "Zones are saved here but inactive until DEALER_ZONES=true on the server."}
            </p>
            {configuredZones.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {configuredZones.map((zone) => (
                  <span key={zone.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-bold text-zinc-300">
                    {zone.name} · {zone.tableNumbers.length} tables
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No zones configured yet.</p>
            )}
          </div>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={rotation.settings.enabled}
              onChange={(e) => void handleEnabledChange(e.target.checked)}
            />
            <span>
              <span className="font-bold text-zinc-200">Enable automatic dealer rotation</span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                When ON, each dealer is rotated after the deal time below. This setting stays independent of time changes.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={rotation.settings.autoAssign}
              onChange={(e) => void handleAutoAssignChange(e.target.checked)}
            />
            <span>
              <span className="font-bold text-zinc-200">Auto-assign from pool (Auto-Pilot)</span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                When ON, open tables are filled automatically from the dealer pool queue. When OFF, use manual assign on the Live tab.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={rotation.settings.handoffFrozen}
              onChange={(e) => void handleHandoffFrozenChange(e.target.checked)}
            />
            <span>
              <span className="font-bold text-zinc-200">Handoff freeze</span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                Pause deal-time table rotations (final table, photo, floor hold). Dealers keep their current tables until you turn this off.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={rotation.settings.workHourAwareAssign}
              onChange={(e) => void handleWorkHourAwareChange(e.target.checked)}
            />
            <span>
              <span className="font-bold text-zinc-200">Work-hour aware assignment</span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                When ON, auto-assign and handoffs pick the dealer with the fewest deal minutes (ties use pool order).
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={rotation.settings.level1FairOrder}
              onChange={(e) => void handleLevel1FairOrderChange(e.target.checked)}
            />
            <span>
              <span className="font-bold text-zinc-200">Level 1 fair order</span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                When ON, Level 1 Distribute assigns tables starting with dealers who have worked the least today.
              </span>
            </span>
          </label>

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">Deal time (T_deal)</p>
            <p className="text-[10px] text-zinc-600 mb-2">
              Selected duration applies to the next assignment or rotation. Active table timers are not reset.
            </p>
            <div className="flex flex-wrap gap-2">
              {T_DEAL_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => void handleTDeal(m)}
                  className={presetButtonClass(!isCustomTDealActive && activeTDeal === m)}
                >
                  {m} min
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (!isCustomTDealActive) {
                    setCustomTDeal("");
                  }
                }}
                className={presetButtonClass(isCustomTDealActive)}
              >
                {isCustomTDealActive ? `Custom ${activeTDeal} min` : "Custom"}
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="number"
                min={1}
                placeholder="Custom minutes"
                value={customTDeal}
                onChange={(e) => setCustomTDeal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCustomTDeal();
                }}
                className={`flex-1 rounded-xl border bg-zinc-950 px-3 py-2 text-sm ${
                  isCustomTDealActive ? "border-amber-500/50 text-amber-100" : "border-zinc-800"
                }`}
              />
              <button
                type="button"
                onClick={() => void handleCustomTDeal()}
                className={`px-4 rounded-xl text-xs font-bold uppercase ${
                  isCustomTDealActive ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                Apply
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">Break time (T_break)</p>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={tBreakDraft}
                onChange={(e) => setTBreakDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleApplyBreak();
                }}
                className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleApplyBreak()}
                className="px-4 rounded-xl bg-zinc-800 text-xs font-bold uppercase text-zinc-300"
              >
                Apply
              </button>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            When the tournament clock enters a structure break level, all dealers go on break together.
            Table assignments are preserved — after the break, dealers return to their assigned table (or receive a new assignment if rotation applies).
            Break duration follows the structure break level length. Dealers get audio alerts 3 min and 1 min before break ends.
          </p>
        </section>
      ) : null}

      {tab === "qr" && checkInUrl ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 flex flex-col items-center gap-4 max-w-sm mx-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Dealer Lounge QR</p>
          <div className="rounded-xl bg-white p-4 shadow-lg">
            <QRCodeSVG
              value={checkInUrl}
              size={220}
              level="H"
              bgColor="#ffffff"
              fgColor="#000000"
              includeMargin
            />
          </div>
          <p className="text-xs text-zinc-400 text-center break-all font-mono">{checkInUrl}</p>
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2 mb-3">
            <ListOrdered className="w-4 h-4" /> Work & Overtime Log
          </h2>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {[...rotation.workLog].reverse().map((entry) => (
              <div key={entry.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs">
                <span className="text-zinc-500">{new Date(entry.timestamp).toLocaleString()}</span>
                {" · "}
                <span className="font-bold text-zinc-200">{entry.dealerName}</span>
                {" · "}
                <span className="text-amber-400 uppercase">{entry.event}</span>
                {entry.tableNumber ? ` · Table ${entry.tableNumber}` : ""}
                {entry.minutesWorked != null ? ` · ${entry.minutesWorked}m` : ""}
                {entry.note ? ` · ${entry.note}` : ""}
              </div>
            ))}
            {rotation.workLog.length === 0 ? (
              <p className="text-sm text-zinc-500">No work log entries yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "hours" ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4" /> Dealer Work Hours
            </h2>
            <DealerWorkHoursPanel staff={rotation.staff} settings={rotation.settings} liveNow={liveNow} />
          </section>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-sky-400" /> Support Staff Hours
            </h2>
            <StaffWorkHoursPanel staff={rotation.staff} liveNow={liveNow} />
          </section>
        </div>
      ) : null}

      {zoneSetupOpen ? (
        <DealerZoneSetupModal
          tables={tournamentState.tables.map((table) => ({ id: table.id, number: table.number }))}
          initialZones={configuredZones}
          onSave={saveDealerZones}
          onClose={() => setZoneSetupOpen(false)}
        />
      ) : null}

      {floorSetupOpen ? (
        <FloorSetupModal
          tables={tournamentState.tables.map((table) => ({ id: table.id, number: table.number }))}
          initialTeams={tournamentState.settings.floorTeams ?? []}
          initialTeamCount={floorSetupTeamCount}
          autoOpenQrTeamId={floorSetupAutoQrTeamId}
          onSave={saveFloorTeams}
          onClose={() => {
            setFloorSetupOpen(false);
            setFloorSetupAutoQrTeamId(null);
          }}
        />
      ) : null}
      </div>
    </div>
  );
}
