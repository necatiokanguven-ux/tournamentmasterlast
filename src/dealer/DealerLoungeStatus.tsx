import DealerBreakCountdown from "./DealerBreakCountdown";
import type { DealerStaff } from "../server/dealerRotation/types";

type DealerLoungeStatusProps = {
  dealer: Pick<DealerStaff, "state" | "tableNumber" | "breakEndAt" | "breakStartedAt">;
  serverTime?: number;
  tBreakMinutes?: number;
  tournamentBreakActive?: boolean;
  tournamentBreakEndAt?: string | null;
};

export default function DealerLoungeStatus({
  dealer,
  serverTime,
  tBreakMinutes = 15,
  tournamentBreakActive = false,
  tournamentBreakEndAt = null,
}: DealerLoungeStatusProps) {
  const breakEndAt = tournamentBreakEndAt ?? dealer.breakEndAt;

  if (dealer.state === "on_table" && dealer.tableNumber && !tournamentBreakActive) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Active Table</p>
        <p className="mt-2 text-5xl font-black text-emerald-200">Table {dealer.tableNumber}</p>
        <p className="mt-3 text-sm text-emerald-200/80">You are dealing. Open the table screen when ready.</p>
      </div>
    );
  }

  if (dealer.state === "on_break" || tournamentBreakActive) {
    return (
      <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">
          {tournamentBreakActive ? "Tournament Break" : "Break Time"}
        </p>
        {dealer.tableNumber ? (
          <>
            <p className="mt-2 text-5xl font-black text-sky-100">Table {dealer.tableNumber}</p>
            <p className="mt-2 text-xs uppercase tracking-wider text-sky-300/80">Return after break</p>
          </>
        ) : (
          <p className="mt-2 text-2xl font-black uppercase text-sky-100">Rest In The Lounge</p>
        )}
        {breakEndAt ? (
          <DealerBreakCountdown
            breakEndAt={breakEndAt}
            breakStartedAt={dealer.breakStartedAt}
            tBreakMinutes={tBreakMinutes}
            serverTime={serverTime}
          />
        ) : null}
        <p className="mt-3 text-sm text-sky-200/80">
          {dealer.tableNumber
            ? "Leave your table now. Your assignment is saved — head back when the countdown ends."
            : "You will be notified when a new assignment arrives."}
        </p>
      </div>
    );
  }

  if (dealer.state === "waiting") {
    return (
      <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-300">Waiting List</p>
        <p className="mt-2 text-2xl font-black uppercase text-violet-100">Awaiting Next Assignment</p>
        <p className="mt-3 text-sm text-violet-200/80">
          Your previous table duty has ended. Stay in the lounge — you will be notified when a table opens.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-600/40 bg-zinc-800/40 p-6 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">Dealer Pool</p>
      <p className="mt-2 text-2xl font-black uppercase text-zinc-100">Awaiting Next Assignment</p>
      <p className="mt-3 text-sm text-zinc-400">
        Wait in the lounge. A new table assignment will appear on this screen.
      </p>
    </div>
  );
}
