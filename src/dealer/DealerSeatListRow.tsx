import { CountryFlag } from "../components/CountryLabel";
import type { DealerSeatSnapshot } from "./useDealerTablePoll";

type DealerSeatListRowProps = {
  seat: DealerSeatSnapshot;
  seatOpenLabel: string;
  isRegistered: boolean;
  onBust: (playerId: string) => void;
};

function SeatNumberBadge({
  number,
  isOpen,
  country,
}: {
  number: number;
  isOpen: boolean;
  country: string | null;
}) {
  const showFlag = !isOpen && Boolean(country?.trim());

  return (
    <span
      className={`flex shrink-0 items-center justify-center gap-0.5 rounded-full border leading-none ${
        showFlag ? "h-[22px] min-w-[22px] px-1" : "h-[22px] w-[22px]"
      } ${
        isOpen
          ? "border-zinc-700 text-zinc-600"
          : "border-amber-500/50 bg-amber-500/10 text-amber-400"
      }`}
      aria-label={`Seat ${number}`}
    >
      <span className="text-[10px] font-black tabular-nums">{number}</span>
      {showFlag ? (
        <CountryFlag
          country={country!}
          className="inline-block h-[10px] w-3.5 shrink-0 rounded-[2px] object-cover"
        />
      ) : null}
    </span>
  );
}

export default function DealerSeatListRow({
  seat,
  seatOpenLabel,
  isRegistered,
  onBust,
}: DealerSeatListRowProps) {
  return (
    <div
      className={`flex h-[28px] items-center gap-2 rounded-lg border px-2 ${
        seat.isOpen
          ? "border-dashed border-zinc-800/80 bg-zinc-950/40 text-zinc-600"
          : "border-zinc-800 bg-zinc-900/80"
      }`}
    >
      <SeatNumberBadge number={seat.seatNumber} isOpen={seat.isOpen} country={seat.country} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase">
        {seat.isOpen ? seatOpenLabel : seat.displayName}
      </span>
      <button
        type="button"
        disabled={seat.isOpen || !seat.playerId || !isRegistered}
        onClick={() => seat.playerId && onBust(seat.playerId)}
        className="shrink-0 rounded border border-red-500/40 px-2 py-0.5 text-[9px] font-black uppercase text-red-400 disabled:opacity-30"
      >
        OUT
      </button>
    </div>
  );
}

export function SeatNumberBadgeForDialog({
  number,
  country,
}: {
  number: number;
  country: string | null;
}) {
  return <SeatNumberBadge number={number} isOpen={false} country={country} />;
}
