import { useEffect, useMemo, useRef } from "react";
import { getBreakRemainingSeconds } from "../dealerRotation/dealerTimeUtils";
import { useSyncedServerNow } from "../dealerRotation/useSyncedServerNow";
import { playDealerAlertBeep } from "./dealerBeep";

function formatCountdown(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Stable key for one break session — avoids re-beeping when breakEndAt drifts between polls. */
function getBreakSessionKey(
  breakEndAt: string,
  breakStartedAt?: string | null,
): string {
  if (breakStartedAt) return breakStartedAt;
  const endMs = new Date(breakEndAt).getTime();
  if (!Number.isFinite(endMs)) return breakEndAt;
  return String(Math.floor(endMs / 60_000));
}

type DealerBreakCountdownProps = {
  breakEndAt: string;
  breakStartedAt?: string | null;
  tBreakMinutes?: number;
  serverTime?: number;
  variant?: "sky" | "overlay";
};

export default function DealerBreakCountdown({
  breakEndAt,
  breakStartedAt = null,
  tBreakMinutes = 30,
  serverTime,
  variant = "sky",
}: DealerBreakCountdownProps) {
  const liveNow = useSyncedServerNow(serverTime);
  const remaining = getBreakRemainingSeconds(
    { breakEndAt, breakStartedAt },
    { tBreakMinutes },
    liveNow,
  );
  const sessionKey = useMemo(
    () => getBreakSessionKey(breakEndAt, breakStartedAt),
    [breakEndAt, breakStartedAt],
  );

  const beepedAt3Min = useRef(false);
  const beepedAt1Min = useRef(false);
  const prevRemaining = useRef<number | null>(null);
  const sessionKeyRef = useRef(sessionKey);

  useEffect(() => {
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      beepedAt3Min.current = false;
      beepedAt1Min.current = false;
      prevRemaining.current = null;
    }
  }, [sessionKey]);

  useEffect(() => {
    if (remaining <= 0) {
      prevRemaining.current = remaining;
      return;
    }

    const prev = prevRemaining.current;
    prevRemaining.current = remaining;

    if (prev === null) {
      return;
    }

    if (!beepedAt3Min.current && prev > 180 && remaining <= 180) {
      beepedAt3Min.current = true;
      playDealerAlertBeep();
    }

    if (!beepedAt1Min.current && prev > 60 && remaining <= 60) {
      beepedAt1Min.current = true;
      playDealerAlertBeep();
    }
  }, [remaining]);

  const borderClass = variant === "overlay"
    ? "border-sky-500/30 bg-sky-500/10"
    : "border-sky-500/30 bg-sky-500/10";

  return (
    <div className={`mt-4 rounded-2xl border px-6 py-5 ${borderClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">Break Remaining</p>
      <p className="mt-2 text-5xl font-black tabular-nums text-sky-100">{formatCountdown(remaining)}</p>
      {remaining <= 180 ? (
        <p className="mt-2 text-xs text-sky-200/80">Return to the poker room soon.</p>
      ) : null}
    </div>
  );
}
