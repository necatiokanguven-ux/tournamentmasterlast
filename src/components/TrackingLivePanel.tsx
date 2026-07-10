import React, { memo } from "react";
import { Clock3, Coffee, Users } from "lucide-react";
import { formatPrizeAmountWithSymbol } from "../currency";
import type { TrackingLiveState } from "../tracking/liveState";
import { formatTrackingClock } from "../tracking/liveState";
import type { TrackingLocale, TrackingTranslations } from "../tracking/translations";

type TrackingLivePanelProps = {
  liveState: TrackingLiveState;
  t: TrackingTranslations;
  locale: TrackingLocale;
};

function LiveStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`text-lg font-black mt-1 tabular-nums ${highlight ? "text-amber-300" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function TrackingLivePanel({ liveState, t, locale }: TrackingLivePanelProps) {
  const currentBlindsLabel = liveState.isBreak ? t.breakLabel : liveState.currentBlinds;
  const clockLabel = liveState.isRunning
    ? formatTrackingClock(liveState.timeRemaining)
    : `${formatTrackingClock(liveState.timeRemaining)} · ${t.paused}`;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4" id="tracking-live-panel">
      <div>
        <h2 className="text-base font-black uppercase tracking-wide text-zinc-100">{liveState.tournamentName}</h2>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-center">
        <div className="flex items-center justify-center gap-2 text-amber-300">
          <Clock3 className="w-5 h-5" />
          <p className="text-[10px] uppercase tracking-widest">{t.timeRemaining}</p>
        </div>
        <p className="text-4xl font-black font-mono tabular-nums text-amber-200 mt-2 min-w-[5.5rem]">{clockLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LiveStat label={t.currentLevel} value={`Level ${liveState.currentLevel}`} />
        <LiveStat label={t.remainingPlayers} value={liveState.playersDisplay} />
        <LiveStat label={t.blinds} value={currentBlindsLabel} />
        <LiveStat
          label={t.nextBlind}
          value={liveState.nextBlinds ?? "-"}
        />
        <LiveStat label={t.averageStack} value={liveState.averageStack.toLocaleString()} />
        <LiveStat
          label={t.prizePool}
          value={formatPrizeAmountWithSymbol(liveState.prizePool, liveState.currencySymbol, liveState.currency, locale)}
          highlight
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coffee className="w-4 h-4 text-cyan-400" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">{t.nextBreak}</p>
        </div>
        <p className="text-sm font-black font-mono tabular-nums text-cyan-300">{liveState.nextBreak}</p>
      </div>

      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-500/80">
        <Users className="w-3.5 h-3.5" />
        <span>{t.liveUpdating}</span>
      </div>
    </section>
  );
}

export default memo(TrackingLivePanel);
