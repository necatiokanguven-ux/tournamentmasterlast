import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useDealerTablePoll } from "./useDealerTablePoll";
import { getDealerDeviceId } from "./dealerDeviceId";
import { localApi } from "../config/api";
import { formatDealerTableTiming, getCurrentTableDealSeconds, getDealRemainingSeconds } from "../dealerRotation/dealerTimeUtils";
import { formatDealerLevel, useMobileI18n } from "../mobile/translations";
import { useLiveSecond } from "../dealerRotation/useLiveSecond";
import type { DealerTimerModeSetting } from "../types";
import type { DealerDeviceType } from "./dealerPaths";
import { dealerHref } from "./dealerPaths";
import type { DealerSeatSnapshot } from "./useDealerTablePoll";
import DealerAssignmentOverlay from "./DealerAssignmentOverlay";
import DealerPhoneSessionBar from "./DealerPhoneSessionBar";
import DealerTabletKioskControl from "./DealerTabletKioskControl";
import TabletTimerPanel from "./TabletTimerPanel";
import { formatPhoneDutyLabel } from "./dealerDutyLabel";
import { readDealerIdentity, subscribeDealerIdentityChanges } from "./dealerIdentity";
import { useDealerPhoneAction } from "./useDealerPhoneAction";
import { dealerNeedsLoungeScreen } from "./dealerTableAccess";
import type { MobileTranslations } from "../mobile/translations";
import DealerSeatListRow, { SeatNumberBadgeForDialog } from "./DealerSeatListRow";

type DealerTabletViewProps = {
  tableNumber: number;
  deviceType?: DealerDeviceType;
};

function formatClock(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatConnectedDeviceLabels(
  types: Array<"tablet" | "phone">,
  t: MobileTranslations,
): string {
  const labels: string[] = [];
  if (types.includes("tablet")) {
    labels.push(t.tableTablet);
  }
  if (types.includes("phone")) {
    labels.push(t.dealerPhone);
  }
  return labels.length > 0 ? labels.join(" · ") : "—";
}

function resolveConnectedDeviceTypes(
  types: Array<"tablet" | "phone"> | undefined,
  isRegistered: boolean,
  currentDevice: DealerDeviceType,
): Array<"tablet" | "phone"> {
  const unique = [...new Set((types ?? []).filter((type) => type === "tablet" || type === "phone"))];
  if (unique.length > 0) {
    return unique;
  }
  if (isRegistered) {
    return [currentDevice === "phone" ? "phone" : "tablet"];
  }
  return [];
}

function padSeats(seats: DealerSeatSnapshot[]): DealerSeatSnapshot[] {
  const padded = [...seats];
  while (padded.length < 9) {
    padded.push({
      seatNumber: padded.length + 1,
      seatIndex: padded.length,
      playerId: null,
      firstName: null,
      lastName: null,
      displayName: null,
      country: null,
      status: null,
      isOpen: true,
    });
  }
  return padded.slice(0, 9);
}

export default function DealerTabletView({ tableNumber, deviceType = "tablet" }: DealerTabletViewProps) {
  const isPhone = deviceType === "phone";
  const { t } = useMobileI18n();
  const liveNow = useLiveSecond();
  const deviceId = useMemo(() => getDealerDeviceId(), []);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [playersExpanded, setPlayersExpanded] = useState(!isPhone);

  const { snapshot, dealerTimer, connectedDeviceTypes, error, isLoading, refresh, applyDealerTimerSnapshot } =
    useDealerTablePoll(tableNumber, true, deviceId, isPhone ? "phone" : "tablet");

  const timerMode: DealerTimerModeSetting = snapshot?.timerSettings.mode ?? "call_time";
  const showTimer = timerMode !== "none";

  const callTimeSeconds = snapshot?.timerSettings.callTimeSeconds ?? 30;
  const playerTimeSeconds = snapshot?.timerSettings.playerTimeSeconds ?? 60;

  const [phoneTimerBusy, setPhoneTimerBusy] = useState(false);
  const [phoneTimerSent, setPhoneTimerSent] = useState(false);

  const handlePhoneTimerTrigger = useCallback(async () => {
    if (!isRegistered || phoneTimerBusy || !showTimer) {
      return;
    }

    setPhoneTimerBusy(true);
    setActionMessage(null);

    try {
      const action = timerMode === "player_time" ? "start_player" : "start_call";
      const response = await fetch(localApi(`/api/dealer/table/${tableNumber}/timer`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, deviceId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "TIMER_ACTION_FAILED");
      }

      setPhoneTimerSent(true);
      window.setTimeout(() => setPhoneTimerSent(false), 1200);
    } catch (triggerError) {
      setActionMessage(
        triggerError instanceof Error ? triggerError.message : "Could not start call time.",
      );
    } finally {
      setPhoneTimerBusy(false);
    }
  }, [deviceId, isRegistered, phoneTimerBusy, showTimer, tableNumber, timerMode]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [floorMessage, setFloorMessage] = useState<string | null>(null);
  const [dealerIdentity, setDealerIdentity] = useState(() => readDealerIdentity());

  useEffect(() => subscribeDealerIdentityChanges(() => {
    setDealerIdentity(readDealerIdentity());
  }), []);
  const [overlayActive, setOverlayActive] = useState(false);
  const { dealer: myDealerState, loading: phoneStateLoading } =
    useDealerPhoneAction(dealerIdentity?.dealerId ?? null, 1000);
  const offTableAssignment = Boolean(
    dealerIdentity && myDealerState && dealerNeedsLoungeScreen(myDealerState, tableNumber),
  );

  const dutyLabel = useMemo(() => {
    if (myDealerState) return formatPhoneDutyLabel(myDealerState);
    if (dealerIdentity) return formatPhoneDutyLabel(dealerIdentity);
    return null;
  }, [myDealerState, dealerIdentity]);

  useEffect(() => {
    if (!dealerIdentity || phoneStateLoading || !myDealerState) return;
    if (dealerNeedsLoungeScreen(myDealerState, tableNumber)) {
      window.location.replace(dealerHref("/dealer/checkin"));
    }
  }, [dealerIdentity, myDealerState, phoneStateLoading, tableNumber]);

  useEffect(() => {
    let cancelled = false;

    const registerDevice = async () => {
      try {
        const response = await fetch(localApi(`/api/dealer/table/${tableNumber}/register`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, deviceType: isPhone ? "phone" : "tablet" }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "DEVICE_REGISTRATION_FAILED");
        }

        if (!cancelled) {
          setIsRegistered(true);
          setRegistrationError(null);
          void refresh();
        }
      } catch (registerError) {
        if (!cancelled) {
          setIsRegistered(false);
          setRegistrationError(
            registerError instanceof Error ? registerError.message : "DEVICE_REGISTRATION_FAILED",
          );
        }
      }
    };

    void registerDevice();

    return () => {
      cancelled = true;
    };
  }, [deviceId, isPhone, refresh, tableNumber]);

  const selectedSeat = useMemo(
    () => snapshot?.seats.find((seat) => seat.playerId === selectedPlayerId) ?? null,
    [snapshot?.seats, selectedPlayerId],
  );

  const isConnected = Boolean(snapshot) && !error;
  const placeholder = isLoading ? "..." : "-";

  const clockValue = snapshot ? formatClock(snapshot.clock.timeRemaining) : placeholder;
  const levelValue = snapshot
    ? formatDealerLevel(snapshot.clock.currentLevel, snapshot.clock.isBreak, t.breakLabel)
    : placeholder;
  const totalPlayers = snapshot?.clock.totalPlayers ?? 0;
  const remainingPlayers = snapshot?.clock.remainingPlayers ?? 0;

  const handleBustRequest = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setConfirmOpen(true);
  };

  const handleConfirmBust = async () => {
    if (!selectedPlayerId) return;

    try {
      const response = await fetch(
        localApi(`/api/dealer/table/${tableNumber}/bust/${selectedPlayerId}`),
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to eliminate player.");
      }

      setActionMessage(t.playerEliminated);
      setConfirmOpen(false);
      setSelectedPlayerId(null);
      await refresh();
    } catch (bustError) {
      setActionMessage(bustError instanceof Error ? bustError.message : t.playerEliminated);
      setConfirmOpen(false);
    }
  };

  const handleFloorCall = async () => {
    try {
      const response = await fetch(localApi(`/api/dealer/table/${tableNumber}/floor-call`), {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || "Floor call failed.");
      }
      setFloorMessage(t.floorCalled);
    } catch (floorError) {
      setFloorMessage(floorError instanceof Error ? floorError.message : t.floorCalled);
    }
  };

  const actionLabel = timerMode === "player_time" ? t.playerTime : t.callTime;

  const registrationMessage =
    registrationError === "DEVICE_LIMIT"
      ? "This table already has 2 connected dealer devices."
      : registrationError;

  const displaySeats = useMemo(() => padSeats(snapshot?.seats ?? []), [snapshot?.seats]);
  const seatedCount = displaySeats.filter((seat) => !seat.isOpen).length;

  const blindsValue = snapshot?.clock.currentBlinds ?? placeholder;
  const nextBlindsValue = snapshot?.clock.nextBlinds ?? placeholder;

  const dealerTiming = useMemo(() => {
    if (!snapshot?.dealerState) {
      return formatDealerTableTiming(null, 0, null);
    }
    const pseudoDealer = {
      state: snapshot.dealerState as "on_table" | "incoming",
      tableId: snapshot.tableId,
      dealStartedAt: snapshot.dealerDealStartedAt,
      dealEndAt: snapshot.dealerDealEndAt,
    };
    const dealSeconds = getCurrentTableDealSeconds(
      pseudoDealer,
      liveNow,
      { tDealMinutes: snapshot.rotationTDealMinutes },
    );
    const remaining = getDealRemainingSeconds(pseudoDealer, liveNow);
    return formatDealerTableTiming(pseudoDealer, dealSeconds, remaining);
  }, [liveNow, snapshot]);

  const connectedDeviceLabel = formatConnectedDeviceLabels(
    resolveConnectedDeviceTypes(
      snapshot?.connectedDeviceTypes ?? connectedDeviceTypes,
      isRegistered,
      deviceType,
    ),
    t,
  );

  const header = (
    <header className="shrink-0" style={{ paddingTop: 8, paddingBottom: 8 }}>
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-black uppercase tracking-wide leading-none">
          {t.table} {tableNumber}
        </h1>
        <div className="flex items-center gap-1.5 pt-0.5">
          <span
            className={`h-2 w-2 rounded-full ${isConnected && isRegistered ? "bg-green-500" : "bg-red-500"}`}
            aria-hidden
          />
          <span
            className={`text-[10px] font-bold uppercase ${
              isConnected && isRegistered ? "text-green-400" : "text-red-400"
            }`}
          >
            {isConnected && isRegistered ? t.connect : t.disconnect}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
        Synced: {connectedDeviceLabel}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
        Dealer: {snapshot?.dealerName ?? (isLoading ? "..." : "—")}
      </p>
      {dealerTiming.dealLabel ? (
        <p className="mt-0.5 text-[10px] font-mono text-emerald-400/90">
          Deal: {dealerTiming.dealLabel}
          {dealerTiming.rotationLabel ? (
            <span className="text-amber-400/90"> · Rot in: {dealerTiming.rotationLabel}</span>
          ) : null}
        </p>
      ) : snapshot?.dealerState === "incoming" ? (
        <p className="mt-0.5 text-[10px] font-bold uppercase text-orange-400/90">Handoff in progress</p>
      ) : null}
    </header>
  );

  const seatList = (
    <div className="flex flex-col" style={{ gap: 3 }}>
      {displaySeats.map((seat) => (
        <DealerSeatListRow
          key={seat.seatIndex}
          seat={seat}
          seatOpenLabel={t.seatOpen}
          isRegistered={isRegistered}
          onBust={handleBustRequest}
        />
      ))}
    </div>
  );

  const playerSectionPhone = (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setPlayersExpanded((open) => !open)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-3"
      >
        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-300">
          {t.players} ({seatedCount}/{displaySeats.length})
        </span>
        {playersExpanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        )}
      </button>
      {playersExpanded ? (
        <div className="mt-2 max-h-[min(38vh,260px)] overflow-y-auto overscroll-contain">{seatList}</div>
      ) : null}
    </div>
  );

  const playerSectionTablet = seatList;

  const floorButton = (
    <button
      type="button"
      disabled={!isRegistered}
      onClick={() => void handleFloorCall()}
      className="shrink-0 rounded-xl bg-orange-500 text-sm font-black uppercase tracking-wider text-black disabled:opacity-50"
      style={{ height: 44 }}
    >
      📞 {t.callFloor}
    </button>
  );

  const tournamentInfo = (
    <div className="shrink-0">
      <div className="grid grid-cols-2" style={{ gap: 8 }}>
        <InfoBox label={t.clock} value={clockValue} />
        <InfoBox label={t.level} value={levelValue} />
        <BlindsInfoBox label={t.blinds} value={blindsValue} />
        <BlindsInfoBox label={t.nextLevel} value={nextBlindsValue} />
        <InfoBox label={t.nextBreak} value={snapshot?.clock.nextBreak ?? placeholder} />
        <PlayersInfoBox label={t.players} total={totalPlayers} remaining={remainingPlayers} loading={isLoading} />
      </div>
    </div>
  );

  const phoneCallTimeButton = showTimer && isPhone ? (
    <button
      type="button"
      disabled={!isRegistered || phoneTimerBusy}
      onClick={() => void handlePhoneTimerTrigger()}
      className="shrink-0 rounded-2xl bg-amber-500 py-7 text-2xl font-black uppercase tracking-wider text-black shadow-lg shadow-amber-500/25 disabled:opacity-50"
    >
      {phoneTimerSent ? "✓ STARTED" : actionLabel}
    </button>
  ) : null;

  const tabletTimerPanel = !isPhone ? (
    <TabletTimerPanel
      tableNumber={tableNumber}
      deviceId={deviceId}
      timerMode={timerMode}
      showTimer={showTimer}
      isRegistered={isRegistered}
      callTimeSeconds={callTimeSeconds}
      playerTimeSeconds={playerTimeSeconds}
      serverTimer={dealerTimer ?? snapshot?.dealerTimer ?? null}
      actionLabel={actionLabel}
      onTimerSnapshot={applyDealerTimerSnapshot}
    />
  ) : null;

  const statusMessages = (
    <>
      {floorMessage ? <p className="mt-1 shrink-0 text-[10px] text-orange-300">{floorMessage}</p> : null}
      {actionMessage ? <p className="mt-1 shrink-0 text-[10px] text-red-300">{actionMessage}</p> : null}
      {registrationMessage ? <p className="mt-1 shrink-0 text-[10px] text-red-400">{registrationMessage}</p> : null}
      {error ? <p className="mt-1 shrink-0 text-[10px] text-red-400">{error}</p> : null}
    </>
  );

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-[#0B0B0B] text-zinc-100">
      {isPhone && dutyLabel && !overlayActive ? (
        <DealerPhoneSessionBar
          dutyLabel={dutyLabel}
          changeDealerHref={dealerHref("/dealer/checkin")}
        />
      ) : null}
      {dealerIdentity ? (
        <DealerAssignmentOverlay
          dealerId={dealerIdentity.dealerId}
          displayName={dealerIdentity.displayName}
          dutyLabel={dutyLabel}
          onActiveChange={setOverlayActive}
        />
      ) : null}
      {isPhone && !dealerIdentity ? (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-amber-500/30 bg-zinc-900 p-3 text-center">
          <a
            href={dealerHref("/dealer/checkin")}
            className="text-xs font-black uppercase tracking-wider text-amber-400"
          >
            Select your name to receive table assignments
          </a>
        </div>
      ) : null}
      {!overlayActive && isPhone && !offTableAssignment ? (
        <div
          className={`mx-auto flex w-full max-w-[360px] flex-col ${dutyLabel ? "pt-14" : ""}`}
          style={{ padding: dutyLabel ? "56px 16px 14px" : "12px 16px 14px", gap: 10 }}
        >
          {header}
          {playerSectionPhone}
          {floorButton}
          {tournamentInfo}
          {phoneCallTimeButton}
          {statusMessages}
        </div>
      ) : null}
      {!isPhone ? (
        <>
          <DealerTabletKioskControl enabled />
          <div
            className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-[1024px] flex-row gap-4 overflow-hidden p-4"
          >
            <aside className="flex h-full min-h-0 w-[38%] max-w-[380px] shrink-0 flex-col overflow-hidden" style={{ gap: 8 }}>
              {header}
              <p className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {t.players} ({seatedCount}/{displaySeats.length})
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
                {playerSectionTablet}
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ gap: 10 }}>
              {floorButton}
              {tournamentInfo}
              {tabletTimerPanel}
              {statusMessages}
            </section>
          </div>
        </>
      ) : null}

      {confirmOpen && selectedSeat ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-lg font-black uppercase tracking-wider">{t.eliminatePlayer}</h2>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <SeatNumberBadgeForDialog number={selectedSeat.seatNumber} country={selectedSeat.country} />
              <p className="min-w-0 flex-1 text-lg font-black uppercase text-zinc-100">
                {selectedSeat.displayName}
              </p>
            </div>
            <p className="mt-4 text-sm text-zinc-400">{t.confirmEliminatePrompt}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmBust()}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase text-white"
              >
                {t.yesEliminate}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 px-3"
      style={{ height: 48 }}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="truncate text-sm font-black text-zinc-100">{value}</p>
    </div>
  );
}

function BlindsInfoBox({ label, value }: { label: string; value: string }) {
  const hasAnte = value.includes("(");
  const isLong = value.length > 16;

  return (
    <div
      className="flex flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 px-2.5"
      style={{ height: 48 }}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={`font-black leading-tight text-zinc-100 ${
          hasAnte || isLong ? "text-[9px] tracking-tight" : "text-xs"
        }`}
        style={{ wordBreak: "break-word" }}
      >
        {value}
      </p>
    </div>
  );
}

function PlayersInfoBox({
  label,
  total,
  remaining,
  loading,
}: {
  label: string;
  total: number;
  remaining: number;
  loading: boolean;
}) {
  return (
    <div
      className="flex flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 px-3"
      style={{ height: 48 }}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      {loading ? (
        <p className="text-sm font-black text-zinc-100">...</p>
      ) : (
        <div className="flex items-baseline gap-1 font-mono font-black tracking-tight">
          <span className="text-sm text-zinc-100">{total}</span>
          <span className="text-[10px] text-zinc-600">/</span>
          <span className="text-sm text-emerald-400">{remaining}</span>
        </div>
      )}
    </div>
  );
}
