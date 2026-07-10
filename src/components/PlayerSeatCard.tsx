import React, { memo } from "react";
import { Armchair, User } from "lucide-react";
import PokerTableIcon from "./PokerTableIcon";
import type { TrackingPlayerSearchItem } from "../tracking/types";
import type { TrackingTranslations } from "../tracking/translations";

type PlayerSeatCardProps = {
  player: TrackingPlayerSearchItem;
  t: TrackingTranslations;
  onChangePlayer: () => void;
};

export default memo(function PlayerSeatCard({ player, t, onChangePlayer }: PlayerSeatCardProps) {
  const hasSeat = player.tableNumber !== null && player.seatNumber !== null;

  return (
    <section
      className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-500/15 to-zinc-900 p-5 space-y-5"
      id="player-seat-card"
    >
      <div className="text-center space-y-2">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">{t.selectedPlayer}</p>
        <p className="text-3xl font-black text-zinc-50 leading-tight">{player.displayName}</p>
        <p className="text-sm text-zinc-400">{hasSeat ? t.goToYourTable : t.noSeatAssigned}</p>
      </div>

      {hasSeat ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-5 text-center">
            <PokerTableIcon className="w-[30px] h-[30px] text-cyan-400 mx-auto mb-2" />
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">{t.table}</p>
            <p className="text-4xl font-black text-cyan-300 mt-1">{player.tableNumber}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-5 text-center">
            <Armchair className="w-5 h-5 text-amber-400 mx-auto mb-2" />
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">{t.seat}</p>
            <p className="text-4xl font-black text-amber-300 mt-1">{player.seatNumber}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-center">
          <User className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-bold text-zinc-400">{t.noSeatAssigned}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onChangePlayer}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 font-bold uppercase tracking-wider py-3 transition text-xs"
      >
        {t.changePlayer}
      </button>
    </section>
  );
});
