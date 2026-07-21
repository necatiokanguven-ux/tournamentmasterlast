import { useCallback } from "react";
import CircularCountdown from "./CircularCountdown";
import { useDealerTimerWebSocket } from "./useDealerTimerWebSocket";
import { useSyncedDealerCountdown } from "./useSyncedDealerCountdown";
import type { DealerTimerModeSetting } from "../types";
import type { DealerTimerSnapshot } from "./dealerTimerTypes";

type TabletTimerPanelProps = {
  tableNumber: number;
  deviceId: string;
  timerMode: DealerTimerModeSetting;
  showTimer: boolean;
  isRegistered: boolean;
  callTimeSeconds: number;
  playerTimeSeconds: number;
  serverTimer: DealerTimerSnapshot | null;
  actionLabel: string;
  onTimerSnapshot: (timer: DealerTimerSnapshot) => void;
};

export default function TabletTimerPanel({
  tableNumber,
  deviceId,
  timerMode,
  showTimer,
  isRegistered,
  callTimeSeconds,
  playerTimeSeconds,
  serverTimer,
  actionLabel,
  onTimerSnapshot,
}: TabletTimerPanelProps) {
  const countdown = useSyncedDealerCountdown({
    tableNumber,
    deviceId,
    serverTimer: showTimer ? serverTimer : null,
    isRegistered,
    callTimeSeconds,
    playerTimeSeconds,
    onTimerSnapshot,
  });

  const handleWireTimerSnapshot = useCallback(
    (timer: DealerTimerSnapshot) => {
      countdown.applyWireTimer(timer);
      onTimerSnapshot(timer);
    },
    [countdown.applyWireTimer, onTimerSnapshot],
  );

  useDealerTimerWebSocket({
    tableNumber,
    timerMode,
    enabled: showTimer,
    onTimerSnapshot: handleWireTimerSnapshot,
  });

  if (!showTimer) {
    return null;
  }

  const configuredTimerSeconds =
    timerMode === "call_time" ? callTimeSeconds : playerTimeSeconds;

  const timerDisplaySeconds =
    countdown.timerState === "running"
      ? countdown.secondsRemaining
      : countdown.timerState === "paused"
        ? countdown.secondsRemaining
        : configuredTimerSeconds;

  const actionHandler = timerMode === "player_time" ? countdown.startPlayerTime : countdown.startCallTime;

  return (
    <>
      <div className="flex shrink-0 items-center justify-center py-2" style={{ minHeight: 170 }}>
        <CircularCountdown
          secondsRemaining={timerDisplaySeconds}
          totalSeconds={countdown.totalSeconds || timerDisplaySeconds}
          ringColor={countdown.ringColor}
          diameter={140}
          strokeWidth={12}
        />
      </div>
      <button
        type="button"
        disabled={!isRegistered}
        onClick={actionHandler}
        className="shrink-0 rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wider text-black disabled:opacity-50"
        style={{ height: 48 }}
      >
        {actionLabel}
      </button>
    </>
  );
}
