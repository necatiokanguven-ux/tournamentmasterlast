import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import CircularCountdown from "./CircularCountdown";
import { useDealerTablePoll } from "./useDealerTablePoll";
import { useSyncedDealerCountdown } from "./useSyncedDealerCountdown";
import { useDealerTimerWebSocket } from "./useDealerTimerWebSocket";
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
import { formatPhoneDutyLabel } from "./dealerDutyLabel";
import { readDealerIdentity } from "./dealerIdentity";
import { useDealerPhoneAction } from "./useDealerPhoneAction";
import { dealerNeedsLoungeScreen } from "./dealerTableAccess";

type DealerTabletViewProps = {
  tableNumber: number;
  deviceType?: DealerDeviceType;
};

function formatClock(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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

  const { snapshot, dealerTimer, connectedDevices, error, isLoading, refresh, applyDealerTimerSnapshot } =
    useDealerTablePoll(tableNumber, true, deviceId);

  const timerMode: DealerTimerModeSetting = snapshot?.timerSettings.mode ?? "call_time";
  const showTimer = timerMode !== "none";

  useDealerTimerWebSocket({
    tableNumber,
    timerMode,
    enabled: showTimer && isRegistered,
    onTimerSnapshot: applyDealerTimerSnapshot,
  });

  const countdown = useSyncedDealerCountdown({
    tableNumber,
    deviceId,
    serverTimer: showTimer ? dealerTimer : null,
    isRegistered,
    onTimerSnapshot: applyDealerTimerSnapshot,
  });

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [floorMessage, setFloorMessage] = useState<string | null>(null);
  const [dealerIdentity] = useState(() => readDealerIdentity());
  const [overlayActive, setOverlayActive] = useState(false);
  const { dealer: myDealerState } = useDealerPhoneAction(dealerIdentity?.dealerId ?? null, 1000);
  const offTableAssignment = Boolean(
    dealerIdentity && myDealerState && dealerNeedsLoungeScreen(myDealerState, tableNumber),
  );

  const dutyLabel = useMemo(() => {
    if (myDealerState) return formatPhoneDutyLabel(myDealerState);
    if (dealerIdentity) return formatPhoneDutyLabel(dealerIdentity);
    return null;
  }, [myDealerState, dealerIdentity]);

  useEffect(() => {
    if (!dealerIdentity || !myDealerState) return;
    if (dealerNeedsLoungeScreen(myDealerState, tableNumber)) {
      window.location.replace(dealerHref("/dealer/checkin"));
    }
  }, [dealerIdentity, myDealerState, tableNumber]);

  useEffect(() => {
    let cancelled = false;

    const registerDevice = async () => {
      try {
        const response = await fetch(localApi(`/api/dealer/table/${tableNumber}/register`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "DEVICE_REGISTRATION_FAILED");
        }

        if (!cancelled) {
          setIsRegistered(true);
          setRegistrationError(null);
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
  }, [deviceId, tableNumber]);

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
  const actionHandler = timerMode === "player_time" ? countdown.startPlayerTime : countdown.startCallTime;

  const registrationMessage =
    registrationError === "DEVICE_LIMIT"
      ? "This table already has 2 connected dealer devices."
      : registrationError;

  const displaySeats = useMemo(() => padSeats(snapshot?.seats ?? []), [snapshot?.seats]);
  const seatedCount = displaySeats.filter((seat) => !seat.isOpen).length;

  const timerDisplaySeconds =
    showTimer && countdown.totalSeconds > 0
      ? countdown.secondsRemaining
      : timerMode === "call_time"
        ? snapshot?.timerSettings.callTimeSeconds ?? 30
        : snapshot?.timerSettings.playerTimeSeconds ?? 60;

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
      <p className="mt-1 truncate text-xs text-zinc-500">{snapshot?.tournamentName ?? t.loading}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
        Synced devices: {connectedDevices}/2
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
    <div className="flex flex-col" style={{ gap: 4 }}>
      {displaySeats.map((seat) => (
        <div
          key={seat.seatIndex}
          className={`flex h-[28px] items-center gap-2 rounded-lg border px-2 ${
            seat.isOpen
              ? "border-dashed border-zinc-800/80 bg-zinc-950/40 text-zinc-600"
              : "border-zinc-800 bg-zinc-900/80"
          }`}
        >
          <SeatNumberBadge number={seat.seatNumber} isOpen={seat.isOpen} />
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase">
            {seat.isOpen ? t.seatOpen : seat.displayName}
          </span>
          <button
            type="button"
            disabled={seat.isOpen || !seat.playerId || !isRegistered}
            onClick={() => seat.playerId && handleBustRequest(seat.playerId)}
            className="shrink-0 rounded border border-red-500/40 px-2 py-0.5 text-[9px] font-black uppercase text-red-400 disabled:opacity-30"
          >
            OUT
          </button>
        </div>
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
      {playersExpanded ? <div className="mt-2">{seatList}</div> : null}
    </div>
  );

  const playerSectionTablet = (
    <div className="min-h-0 flex-1 overflow-y-auto">{seatList}</div>
  );

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

  const timerSection = showTimer ? (
    <>
      <div className="flex shrink-0 items-center justify-center py-2" style={{ minHeight: 170 }}>
        <CircularCountdown
          secondsRemaining={timerDisplaySeconds}
          totalSeconds={countdown.totalSeconds || timerDisplaySeconds}
          ringColor={countdown.ringColor}
          diameter={140}
          strokeWidth={12}
        />
      </div>
      <button
        type="button"
        disabled={!isRegistered}
        onClick={actionHandler}
        className="shrink-0 rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wider text-black disabled:opacity-50"
        style={{ height: 48 }}
      >
        {actionLabel}
      </button>
    </>
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
      {isPhone && dutyLabel && !overlayActive ? <DealerPhoneSessionBar dutyLabel={dutyLabel} /> : null}
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
          {timerSection}
          {statusMessages}
        </div>
      ) : null}
      {!isPhone ? (
        <div
          className="mx-auto flex min-h-[100dvh] w-full max-w-[1024px] flex-row gap-4 p-4"
          style={{ minHeight: "100dvh" }}
        >
          <aside className="flex w-[38%] max-w-[380px] shrink-0 flex-col" style={{ gap: 10 }}>
            {header}
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {t.players} ({seatedCount}/{displaySeats.length})
            </p>
            {playerSectionTablet}
          </aside>

          <section className="flex min-w-0 flex-1 flex-col" style={{ gap: 10 }}>
            {floorButton}
            {tournamentInfo}
            {timerSection}
            {statusMessages}
          </section>
        </div>
      ) : null}

      {confirmOpen && selectedSeat ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-lg font-black uppercase tracking-wider">{t.eliminatePlayer}</h2>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <SeatNumberBadge number={selectedSeat.seatNumber} isOpen={false} />
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

function SeatNumberBadge({ number, isOpen }: { number: number; isOpen: boolean }) {
  return (
    <span
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[10px] font-black tabular-nums leading-none ${
        isOpen
          ? "border-zinc-700 text-zinc-600"
          : "border-amber-500/50 bg-amber-500/10 text-amber-400"
      }`}
      aria-label={`Seat ${number}`}
    >
      {number}
    </span>
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
