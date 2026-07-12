import React, { memo, useMemo, useState } from "react";
import { Clock3, Coffee, Layers, Users, Trophy, X } from "lucide-react";
import { formatTrackingPrizeAmount } from "../currency";
import type { TrackingLiveState } from "../tracking/liveState";
import { formatTrackingAverageStack, formatTrackingClock, normalizeTrackingLiveState } from "../tracking/liveState";
import type { TrackingTranslations } from "../tracking/translations";

type TrackingLivePanelProps = {
  liveState: TrackingLiveState;
  t: TrackingTranslations;
};

function LiveStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 h-full">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="text-lg font-black mt-1 tabular-nums leading-tight text-zinc-100">{value}</p>
    </div>
  );
}

function HighlightStat({
  label,
  icon: Icon,
  value,
  hint,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  hint?: string;
  onClick?: () => void;
}) {
  const className =
    "rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 h-full text-left transition hover:bg-amber-500/15 flex flex-col justify-between";

  const content = (
    <>
      <div>
        <div className="flex items-center gap-2 text-amber-300">
          <Icon className="w-4 h-4 shrink-0" />
          <p className="text-[10px] uppercase tracking-widest">{label}</p>
        </div>
        <p className="text-lg font-black tabular-nums text-amber-200 mt-2 leading-tight notranslate" translate="no">
          {value}
        </p>
      </div>
      {hint && <p className="text-[10px] uppercase tracking-widest text-amber-300/70 mt-2">{hint}</p>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function RemainingPlayersValue({ totalPlayers, remainingPlayers }: { totalPlayers: number; remainingPlayers: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-zinc-400">{totalPlayers}</span>
      <span className="text-zinc-600">/</span>
      <span className="text-emerald-400">{remainingPlayers}</span>
    </span>
  );
}

function TrackingOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-zinc-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TrackingLivePanel({ liveState, t }: TrackingLivePanelProps) {
  const [showFullPool, setShowFullPool] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const normalizedState = useMemo(() => normalizeTrackingLiveState(liveState), [liveState]);
  const payouts = normalizedState.payouts;
  const prizeLabel = formatTrackingPrizeAmount(normalizedState.prizePool, normalizedState.currency);
  const averageStackLabel = useMemo(() => formatTrackingAverageStack(liveState), [liveState]);

  const currentBlindsLabel = normalizedState.isBreak ? t.breakLabel : normalizedState.currentBlinds;
  const clockLabel = normalizedState.isRunning
    ? formatTrackingClock(normalizedState.timeRemaining)
    : `${formatTrackingClock(normalizedState.timeRemaining)} · ${t.paused}`;

  return (
    <>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4" id="tracking-live-panel">
        <div>
          <h2 className="text-base font-black uppercase tracking-wide text-zinc-100">{normalizedState.tournamentName}</h2>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-2 text-amber-300">
            <Clock3 className="w-5 h-5" />
            <p className="text-[10px] uppercase tracking-widest">{t.timeRemaining}</p>
          </div>
          <p className="text-4xl font-black font-mono tabular-nums text-amber-200 mt-2 min-w-[5.5rem]">{clockLabel}</p>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-300">
              <Coffee className="w-5 h-5" />
              <p className="text-[10px] uppercase tracking-widest">{t.nextBreak}</p>
            </div>
            <p className="text-2xl font-black font-mono tabular-nums text-amber-200">{normalizedState.nextBreak}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-stretch">
          <LiveStat label={t.currentLevel} value={`Level ${normalizedState.currentLevel}`} />
          <LiveStat
            label={t.remainingPlayers}
            value={
              <RemainingPlayersValue
                totalPlayers={normalizedState.totalPlayers}
                remainingPlayers={normalizedState.remainingPlayers}
              />
            }
          />
          <LiveStat label={t.blinds} value={currentBlindsLabel} />
          <LiveStat label={t.nextBlind} value={normalizedState.nextBlinds ?? "-"} />
          <HighlightStat
            label={t.averageStack}
            icon={Layers}
            value={averageStackLabel}
          />
          <HighlightStat
            label={t.prizePool}
            icon={Trophy}
            value={prizeLabel}
            hint={t.tapForFullPrizePool}
            onClick={() => setShowFullPool(true)}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowDistribution(true)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-200 hover:border-zinc-500"
        >
          {t.viewPayoutDistribution}
        </button>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-500/80">
          <Users className="w-3.5 h-3.5" />
          <span>{t.liveUpdating}</span>
        </div>
      </section>

      {showFullPool && (
        <TrackingOverlay title={t.totalPrizePool} onClose={() => setShowFullPool(false)}>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-center">
            <p className="text-4xl font-black tabular-nums text-amber-200 notranslate" translate="no">{prizeLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowFullPool(false)}
            className="mt-4 w-full rounded-xl bg-zinc-800 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-100"
          >
            {t.close}
          </button>
        </TrackingOverlay>
      )}

      {showDistribution && (
        <TrackingOverlay title={t.viewPayoutDistribution} onClose={() => setShowDistribution(false)}>
          {payouts.length === 0 ? (
            <p className="text-sm text-zinc-400">{t.noPayoutStructure}</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-[56px_1fr_1fr] gap-2 px-2 text-[10px] uppercase tracking-widest text-zinc-500">
                <span>{t.payoutPlace}</span>
                <span>{t.payoutPercent}</span>
                <span className="text-right">{t.payoutAmount}</span>
              </div>
              {payouts.map((payout) => (
                <div
                  key={payout.rank}
                  className="grid grid-cols-[56px_1fr_1fr] gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm"
                >
                  <span className="font-black text-zinc-100">#{payout.rank}</span>
                  <span className="tabular-nums text-zinc-300">{payout.percentage.toFixed(1)}%</span>
                  <span className="tabular-nums text-amber-200 text-right font-bold notranslate" translate="no">
                    {formatTrackingPrizeAmount(payout.amount, normalizedState.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowDistribution(false)}
            className="mt-4 w-full rounded-xl bg-zinc-800 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-100"
          >
            {t.close}
          </button>
        </TrackingOverlay>
      )}
    </>
  );
}

export default memo(TrackingLivePanel);
