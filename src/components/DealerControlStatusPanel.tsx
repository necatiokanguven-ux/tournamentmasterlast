import { Siren, CheckCircle2, X } from "lucide-react";
import type { CoverageSummary } from "../dealerRotation/dealerCoverageUtils";
import {
  DEAL_BEFORE_BREAK_DISMISS_KEY,
  isAlertDismissible,
  isDealBeforeBreakDismissed,
  operatorAlertFingerprint,
} from "../dealerRotation/dealerAlertSilencing";
import {
  computeRotationTimingInsight,
  CRITICAL_WORK_BEFORE_BREAK_MINUTES,
  resolveDealerControlStatusLevel,
  type RotationTimingInsight,
} from "../dealerRotation/dealerRotationTiming";
import type { OperatorCoverageAlert } from "../server/dealerRotation/types";

type DealerControlStatusPanelProps = {
  enabled: boolean;
  handoffFrozen: boolean;
  workHourAwareAssign: boolean;
  coverageSummary: CoverageSummary | null;
  operatorAlerts: OperatorCoverageAlert[];
  dismissedAlertKeys: string[];
  tDealMinutes: number;
  tBreakMinutes: number;
  onDismissAlert?: (fingerprint: string) => void;
};

type AlertLineItem = {
  key: string;
  message: string;
  dismissKey?: string;
  critical?: boolean;
};

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

const UNDERSTAFFED_DISMISS_KEY = "UNDERSTAFFED_RATIO:x:x";

function buildAlertLines(
  coverageSummary: CoverageSummary | null,
  operatorAlerts: OperatorCoverageAlert[],
  timing: RotationTimingInsight | null,
  dismissedAlertKeys: string[],
): AlertLineItem[] {
  const lines: AlertLineItem[] = [];

  if (coverageSummary?.hasCriticalAlert) {
    lines.push({
      key: "uncovered-tables",
      message: `Uncovered tables: ${coverageSummary.uncoveredTableNumbers.join(", ")}`,
      critical: true,
    });
  }

  if (
    coverageSummary?.hasStaffingWarning
    && timing
    && !dismissedAlertKeys.includes(UNDERSTAFFED_DISMISS_KEY)
  ) {
    lines.push({
      key: "understaffed-ratio",
      message: timing.dealerStaffingLabel,
      dismissKey: UNDERSTAFFED_DISMISS_KEY,
    });
  }

  for (const alert of operatorAlerts.filter(
    a => a.type === "OVERTIME_COVERAGE" || a.type === "ACTION_BLOCKED",
  )) {
    lines.push({
      key: alert.id,
      message: alert.message,
      dismissKey: isAlertDismissible(alert) ? operatorAlertFingerprint(alert) : undefined,
    });
  }

  if (
    timing
    && !timing.workBeforeBreakOk
    && !isDealBeforeBreakDismissed(dismissedAlertKeys)
  ) {
    lines.push({
      key: "deal-before-break",
      message: `Deal before break ${formatMinutes(timing.workMinutesBeforeBreak)} — above ${CRITICAL_WORK_BEFORE_BREAK_MINUTES}m threshold`,
      dismissKey: DEAL_BEFORE_BREAK_DISMISS_KEY,
    });
  }

  return lines;
}

export default function DealerControlStatusPanel({
  enabled,
  handoffFrozen,
  workHourAwareAssign,
  coverageSummary,
  operatorAlerts,
  dismissedAlertKeys,
  tDealMinutes,
  tBreakMinutes,
  onDismissAlert,
}: DealerControlStatusPanelProps) {
  if (!enabled) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-500">
        Automatic rotation is off — status panel inactive.
      </div>
    );
  }

  const timing = coverageSummary
    ? computeRotationTimingInsight({
        tableCount: coverageSummary.activeTableCount,
        dealerCount: coverageSummary.activeDealerCount,
        requiredDealerCount: coverageSummary.requiredDealerCount,
        tDealMinutes,
        tBreakMinutes,
      })
    : null;

  const hasTransientAlert = operatorAlerts.some(
    a => a.type === "OVERTIME_COVERAGE" || a.type === "ACTION_BLOCKED",
  );

  const workBeforeBreakDismissed = isDealBeforeBreakDismissed(dismissedAlertKeys);
  const understaffedDismissed = dismissedAlertKeys.includes(UNDERSTAFFED_DISMISS_KEY);

  const statusLevel = resolveDealerControlStatusLevel({
    enabled,
    hasCriticalAlert: coverageSummary?.hasCriticalAlert ?? false,
    hasStaffingWarning: (coverageSummary?.hasStaffingWarning ?? false) && !understaffedDismissed,
    hasTransientAlert,
    workBeforeBreakOk: (timing?.workBeforeBreakOk ?? true) || workBeforeBreakDismissed,
    tableCount: coverageSummary?.activeTableCount ?? 0,
  });

  const alertLines = buildAlertLines(coverageSummary, operatorAlerts, timing, dismissedAlertKeys);

  const shellClass =
    statusLevel === "ok"
      ? "border-emerald-500/40 bg-emerald-950/30"
      : statusLevel === "warning"
        ? "border-amber-500/45 bg-amber-950/25"
        : "border-red-500/50 bg-red-950/30";

  const titleClass =
    statusLevel === "ok"
      ? "text-emerald-300"
      : statusLevel === "warning"
        ? "text-amber-300"
        : "text-red-300";

  const StatusIcon = statusLevel === "ok" ? CheckCircle2 : Siren;

  return (
    <div className={`rounded-xl border px-3 py-2 ${shellClass}`}>
      {handoffFrozen ? (
        <p className="mb-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-200">
          Handoff freeze active — table rotations paused; auto-assign still fills empty tables when enabled.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className={`flex items-center gap-1.5 ${titleClass}`}>
          <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusLevel === "critical" ? "animate-pulse" : ""}`} />
          <span className="text-[10px] font-black uppercase tracking-wider">
            {statusLevel === "ok" ? "Status OK" : statusLevel === "warning" ? "Warning" : "Alert"}
          </span>
        </div>

        {timing && timing.tableCount > 0 ? (
          <>
            <span className="text-[10px] text-zinc-400">
              {timing.tableCount} tables · {timing.dealerCount} dealers
            </span>
            <span
              className={`text-[10px] font-bold ${
                timing.dealerStaffingSufficient ? "text-emerald-400/90" : "text-amber-400/90"
              }`}
            >
              {timing.dealerStaffingLabel}
            </span>
          </>
        ) : null}
      </div>

      {timing && timing.tableCount > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] leading-snug">
          <span className="text-zinc-400">
            Deal: <span className="font-bold text-zinc-200">{timing.dealStintMinutes}m</span>
            {" · "}
            Break: <span className="font-bold text-zinc-200">{timing.breakStintMinutes}m</span>
          </span>
          <span className="text-zinc-400">
            Full rotation: <span className="font-bold text-zinc-200">{formatMinutes(timing.fullCycleMinutes)}</span>
          </span>
          <span className="text-zinc-400">
            Deal before break:{" "}
            <span
              className={`font-black ${
                timing.workBeforeBreakOk || workBeforeBreakDismissed ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {formatMinutes(timing.workMinutesBeforeBreak)}
            </span>
            <span className="text-zinc-500"> ({CRITICAL_WORK_BEFORE_BREAK_MINUTES}m threshold)</span>
          </span>
          {workHourAwareAssign ? (
            <span className="text-emerald-400/90 font-bold">Fair assign ON</span>
          ) : null}
        </div>
      ) : null}

      {alertLines.length > 0 ? (
        <ul className="mt-1.5 space-y-1 border-t border-white/5 pt-1.5">
          {alertLines.map((line) => (
            <li key={line.key} className="flex items-start gap-2 text-[10px] text-zinc-300 leading-snug">
              <span className="flex-1">{line.message}</span>
              {line.dismissKey && onDismissAlert && !line.critical ? (
                <button
                  type="button"
                  onClick={() => onDismissAlert(line.dismissKey!)}
                  className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  title="Dismiss this warning until the condition clears"
                >
                  <X className="w-3 h-3" />
                  Dismiss
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : statusLevel === "ok" && timing && timing.tableCount > 0 ? (
        <p className="mt-1 text-[10px] text-emerald-400/70 leading-snug">
          All tables covered · rotation balance OK.
        </p>
      ) : null}
    </div>
  );
}
