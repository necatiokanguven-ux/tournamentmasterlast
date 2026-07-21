import { useEffect, useState } from "react";
import { localApi } from "../config/api";
import DealerBreakCountdown from "./DealerBreakCountdown";
import DealerPhoneSessionBar from "./DealerPhoneSessionBar";
import { playDealerAlertBeep } from "./dealerBeep";
import type { DealerPhoneAction } from "./dealerPhoneActions";
import type { DealerStaff } from "../server/dealerRotation/types";
import { useDealerPhoneAction, hasActiveDealerDuty } from "./useDealerPhoneAction";

type DealerAssignmentOverlayProps = {
  dealerId: string;
  displayName: string;
  dutyLabel?: string | null;
  changeDealerHref?: string;
  onActiveChange?: (active: boolean) => void;
};

function EmergencyCallScreen({
  message,
  displayName,
  busy,
  onAck,
}: {
  message: string;
  displayName: string;
  busy: boolean;
  onAck: () => void;
}) {
  useEffect(() => {
    playDealerAlertBeep();
    const timer = window.setInterval(() => playDealerAlertBeep(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <p className="text-[11px] font-black uppercase tracking-[0.35em] text-red-300 animate-pulse">Emergency</p>
      <p className="mt-6 text-3xl font-black uppercase leading-tight text-red-100">Come To The Poker Room</p>
      <p className="mt-4 text-sm font-bold text-red-200/90">{message}</p>
      <p className="mt-2 text-xs text-red-300/70">{displayName}</p>
      <button
        type="button"
        disabled={busy}
        onClick={onAck}
        className="mt-8 w-full rounded-2xl bg-red-500 py-5 text-lg font-black uppercase tracking-wider text-white disabled:opacity-40"
      >
        On My Way
      </button>
    </>
  );
}

function renderActionContent(
  action: DealerPhoneAction,
  displayName: string,
  dealer: DealerStaff | null,
  serverTime: number | undefined,
  tBreakMinutes: number,
  busy: boolean,
  isTournamentBreak: boolean,
  onAcceptTable: () => void,
  onAckRelease: () => void,
  onAckDuty: () => void,
  onAckEmergency: () => void,
) {
  switch (action.kind) {
    case "emergency_call":
      return (
        <EmergencyCallScreen
          message={action.message}
          displayName={displayName}
          busy={busy}
          onAck={onAckEmergency}
        />
      );

    case "go_to_table":
      return (
        <>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">New Assignment</p>
          <p className="mt-4 text-7xl font-black text-zinc-100">Table {action.tableNumber}</p>
          <p className="mt-4 text-sm text-zinc-300">{action.message}</p>
          <p className="mt-2 text-xs text-zinc-500">{displayName}</p>
          <button
            type="button"
            disabled={busy}
            onClick={onAcceptTable}
            className="mt-8 w-full rounded-2xl bg-amber-500 py-5 text-lg font-black uppercase tracking-wider text-black disabled:opacity-40"
          >
            Going To Table
          </button>
        </>
      );

    case "wait_for_handoff":
      return (
        <>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">Waiting For Handoff</p>
          <p className="mt-4 text-7xl font-black text-zinc-100">Table {action.tableNumber}</p>
          <p className="mt-4 text-sm font-bold leading-relaxed text-amber-100">{action.message}</p>
          <p className="mt-6 rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-xs text-zinc-400">
            The outgoing dealer must accept their release first. This screen will update automatically.
          </p>
        </>
      );

    case "rotation_ended":
      return (
        <>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-400">Rotation Ended</p>
          <p className="mt-4 text-7xl font-black text-zinc-100">Table {action.tableNumber}</p>
          <p className="mt-4 text-sm text-zinc-300">{action.message}</p>
          <button
            type="button"
            disabled={busy}
            onClick={onAckRelease}
            className="mt-8 w-full rounded-2xl bg-orange-500 py-5 text-lg font-black uppercase tracking-wider text-black disabled:opacity-40"
          >
            Acknowledged
          </button>
        </>
      );

    case "go_to_break":
      return (
        <>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-sky-400">
            {isTournamentBreak ? "Tournament Break" : "Break Time"}
          </p>
          {action.returnTableNumber ? (
            <>
              <p className="mt-4 text-5xl font-black text-sky-100">Table {action.returnTableNumber}</p>
              <p className="mt-2 text-xs uppercase tracking-wider text-sky-300/80">After break</p>
            </>
          ) : (
            <p className="mt-6 text-2xl font-black uppercase text-zinc-100">Rest In The Lounge</p>
          )}
          <p className="mt-4 text-sm text-zinc-300">{action.message}</p>
          {action.breakEndAt ? (
            <DealerBreakCountdown
              breakEndAt={action.breakEndAt}
              breakStartedAt={dealer?.breakStartedAt}
              tBreakMinutes={tBreakMinutes}
              serverTime={serverTime}
              variant="overlay"
            />
          ) : null}
          <p className="mt-8 text-xs uppercase tracking-wider text-sky-300/80">Break in progress</p>
        </>
      );

    case "on_waiting":
      return (
        <>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-400">Waiting List</p>
          <p className="mt-6 text-2xl font-black uppercase text-zinc-100">Leave Your Table</p>
          <p className="mt-4 text-sm text-zinc-300">{action.message}</p>
          <button
            type="button"
            disabled={busy}
            onClick={onAckDuty}
            className="mt-8 w-full rounded-2xl bg-violet-500 py-5 text-lg font-black uppercase tracking-wider text-black disabled:opacity-40"
          >
            I Accept This Duty
          </button>
        </>
      );

    case "in_pool":
      return (
        <>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400">Dealer Pool</p>
          <p className="mt-6 text-2xl font-black uppercase text-zinc-100">New Duty</p>
          <p className="mt-4 text-sm text-zinc-300">{action.message}</p>
          <button
            type="button"
            disabled={busy}
            onClick={onAckDuty}
            className="mt-8 w-full rounded-2xl bg-zinc-200 py-5 text-lg font-black uppercase tracking-wider text-black disabled:opacity-40"
          >
            I Accept This Duty
          </button>
        </>
      );

    default:
      return null;
  }
}

export default function DealerAssignmentOverlay({
  dealerId,
  displayName,
  dutyLabel,
  changeDealerHref,
  onActiveChange,
}: DealerAssignmentOverlayProps) {
  const { action, dealer, serverTime, tBreakMinutes, tournamentBreak } = useDealerPhoneAction(dealerId, 1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = hasActiveDealerDuty(action);

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const postAction = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(localApi(`/api/dealer-control${path}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const code = String(data.error ?? "");
        if (code === "OUTGOING_HANDOFF_PENDING") {
          throw new Error("Wait for the dealer at the table to accept their release before you can take the table.");
        }
        throw new Error(code || "Request failed.");
      }
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!active) {
    return null;
  }

  const isEmergency = action.kind === "emergency_call";

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col ${
        isEmergency ? "bg-red-950" : "bg-black/97"
      }`}
    >
      {dutyLabel ? (
        <DealerPhoneSessionBar dutyLabel={dutyLabel} changeDealerHref={changeDealerHref} />
      ) : null}
      <div className={`flex flex-1 items-center justify-center p-4 ${dutyLabel ? "pt-14" : ""}`}>
        <div className="w-full max-w-md text-center">
          {renderActionContent(
          action,
          displayName,
          dealer,
          serverTime,
          tBreakMinutes,
          busy,
          tournamentBreak.active,
          () => {
            if (action.kind !== "go_to_table") return;
            void postAction("/accept-table-duty", { dealerId, tableId: action.tableId });
          },
          () => void postAction("/ack-release", { dealerId }),
          () => void postAction("/ack-duty", { dealerId }),
          () => void postAction("/ack-emergency", { dealerId }),
        )}
        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

export { hasActiveDealerDuty };
