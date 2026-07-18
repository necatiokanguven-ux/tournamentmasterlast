import { useMemo, useState } from "react";
import { AlertTriangle, PhoneCall } from "lucide-react";
import CircularCountdown from "./CircularCountdown";
import { useDealerTablePoll } from "./useDealerTablePoll";
import { useLocalCountdown } from "./useLocalCountdown";
import { localApi } from "../config/api";

type DealerTabletViewProps = {
  tableNumber: number;
};

function formatClock(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function DealerTabletView({ tableNumber }: DealerTabletViewProps) {
  const { snapshot, error, refresh } = useDealerTablePoll(tableNumber, true);
  const callSeconds = snapshot?.timerSettings.callTimeSeconds ?? 30;
  const playerSeconds = snapshot?.timerSettings.playerTimeSeconds ?? 60;
  const countdown = useLocalCountdown(callSeconds, playerSeconds);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [floorMessage, setFloorMessage] = useState<string | null>(null);

  const selectedSeat = useMemo(
    () => snapshot?.seats.find((seat) => seat.playerId === selectedPlayerId) ?? null,
    [snapshot?.seats, selectedPlayerId],
  );

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

      setActionMessage("Player eliminated.");
      setConfirmOpen(false);
      setSelectedPlayerId(null);
      await refresh();
    } catch (bustError) {
      setActionMessage(bustError instanceof Error ? bustError.message : "Failed to eliminate player.");
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
      setFloorMessage("Floor called.");
    } catch (floorError) {
      setFloorMessage(floorError instanceof Error ? floorError.message : "Floor call failed.");
    }
  };

  const timerLabel =
    countdown.mode === "call_time"
      ? "Call Time"
      : countdown.mode === "player_time"
        ? "Player Time"
        : "Ready";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[30%_70%]">
        <aside className="border-b border-zinc-800 lg:border-b-0 lg:border-r p-4 flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">Dealer Tablet</p>
            <h1 className="text-4xl font-black">Table {tableNumber}</h1>
            <p className="text-sm text-zinc-500 mt-1">{snapshot?.tournamentName ?? "Loading..."}</p>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            {(snapshot?.seats ?? []).map((seat) => (
              <button
                key={seat.seatIndex}
                type="button"
                disabled={seat.isOpen || !seat.playerId}
                onClick={() => seat.playerId && handleBustRequest(seat.playerId)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  seat.isOpen
                    ? "border-dashed border-zinc-800 bg-zinc-950/40 text-zinc-500"
                    : "border-zinc-800 bg-zinc-900 hover:border-red-500/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-amber-400">Seat {seat.seatNumber}</span>
                  {!seat.isOpen ? <span className="text-[10px] uppercase text-zinc-500">Tap to eliminate</span> : null}
                </div>
                <p className="mt-1 text-sm font-bold uppercase truncate">
                  {seat.isOpen ? "Seat Open" : seat.displayName}
                </p>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleFloorCall()}
            className="rounded-xl bg-orange-500 px-4 py-4 text-sm font-black uppercase tracking-wider text-black flex items-center justify-center gap-2"
          >
            <PhoneCall className="w-4 h-4" />
            Call Floor
          </button>
          {floorMessage ? <p className="text-xs text-orange-300">{floorMessage}</p> : null}
          {actionMessage ? <p className="text-xs text-red-300">{actionMessage}</p> : null}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </aside>

        <section className="flex flex-col min-h-[70vh] lg:min-h-screen">
          <div className="h-[20%] min-h-[120px] border-b border-zinc-800 p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <InfoCard label="Clock" value={snapshot ? formatClock(snapshot.clock.timeRemaining) : "--:--"} />
            <InfoCard label="Level" value={snapshot ? String(snapshot.clock.currentLevel) : "-"} />
            <InfoCard label="Blinds" value={snapshot?.clock.currentBlinds ?? "-"} />
            <InfoCard label="Next Level" value={snapshot?.clock.nextBlinds ?? "-"} />
            <InfoCard label="Next Break" value={snapshot?.clock.nextBreak ?? "-"} />
            <InfoCard
              label="Players"
              value={snapshot ? `${snapshot.clock.remainingPlayers}/${snapshot.clock.totalPlayers}` : "-"}
            />
          </div>

          <div className="flex-1 p-4 flex flex-col">
            <div className="flex-1 flex items-center justify-center">
              <CircularCountdown
                secondsRemaining={countdown.secondsRemaining}
                totalSeconds={countdown.totalSeconds}
                ringColor={countdown.ringColor}
                label={timerLabel}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 pt-4">
              <ActionButton label="Call Time" accent onClick={countdown.startCallTime} />
              <ActionButton label="Player Time" onClick={countdown.startPlayerTime} />
              <ActionButton label="Start" onClick={countdown.resumeTimer} />
              <ActionButton label="Pause" onClick={countdown.pauseTimer} />
              <ActionButton label="Reset" onClick={countdown.resetTimer} />
            </div>
          </div>
        </section>
      </div>

      {confirmOpen && selectedSeat ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-lg font-black uppercase tracking-wider">Eliminate Player</h2>
            </div>
            <p className="mt-4 text-sm text-zinc-300">
              {selectedSeat.displayName} — oyuncuyu silmek istediğinizden emin misiniz?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmBust()}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase text-white"
              >
                Yes, Eliminate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-black text-zinc-100 truncate">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  accent = false,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-4 text-xs font-black uppercase tracking-wider ${
        accent ? "bg-amber-500 text-black" : "border border-zinc-700 bg-zinc-900 text-zinc-100"
      }`}
    >
      {label}
    </button>
  );
}
