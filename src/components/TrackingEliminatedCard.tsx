import React, { memo } from "react";
import type { TrackingTranslations } from "../tracking/translations";

type TrackingEliminatedCardProps = {
  playerName: string;
  t: TrackingTranslations;
  onChangePlayer: () => void;
};

function TrackingEliminatedCard({ playerName, t, onChangePlayer }: TrackingEliminatedCardProps) {
  return (
    <section className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-center space-y-4">
      <div className="space-y-2">
        <p className="text-2xl font-black uppercase tracking-wide text-zinc-100">{t.tournamentFinished}</p>
        <p className="text-base text-zinc-400">{t.thanksForPlaying}</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">{t.playerName}</p>
        <p className="text-xl font-black text-zinc-100 mt-1">{playerName}</p>
      </div>

      <button
        type="button"
        onClick={onChangePlayer}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 font-bold uppercase tracking-wider py-3 transition text-xs"
      >
        {t.changePlayer}
      </button>
    </section>
  );
}

export default memo(TrackingEliminatedCard);
