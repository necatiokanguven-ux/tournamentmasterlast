import { useEffect, useRef } from "react";
import { localWsApi } from "../config/api";
import { isWsEnabled } from "../config/featureFlags";
import type { DealerTimerModeSetting } from "../types";
import type { DealerTimerSnapshot } from "./dealerTimerTypes";
import { dealerTimerChannelForTable } from "./dealerTimerChannelClient";
import { useTournamentSocket } from "../websocket/useTournamentSocket";
import { isChannelPayloadMessage } from "../websocket/tournamentSocketTypes";

type TimerMessage = {
  type: "dealer_timer";
  tableNumber: number;
  dealerTimer: DealerTimerSnapshot;
};

type UseDealerTimerWebSocketInput = {
  tableNumber: number;
  timerMode: DealerTimerModeSetting | null | undefined;
  enabled: boolean;
  onTimerSnapshot: (timer: DealerTimerSnapshot) => void;
};

export function useDealerTimerWebSocket({
  tableNumber,
  timerMode,
  enabled,
  onTimerSnapshot,
}: UseDealerTimerWebSocketInput) {
  const wsEnabled = isWsEnabled();
  const channel = tableNumber ? dealerTimerChannelForTable(tableNumber) : null;
  const hubActive = enabled && timerMode === "call_time" && Boolean(tableNumber) && wsEnabled;
  const onTimerSnapshotRef = useRef(onTimerSnapshot);
  onTimerSnapshotRef.current = onTimerSnapshot;

  useTournamentSocket({
    enabled: hubActive,
    channels: channel ? [channel] : [],
    onMessage: (message) => {
      if (!channel || !isChannelPayloadMessage(message) || message.channel !== channel) return;
      const payload = message.payload as { dealerTimer?: DealerTimerSnapshot | null };
      if (payload.dealerTimer) {
        onTimerSnapshotRef.current(payload.dealerTimer);
      }
    },
  });

  useEffect(() => {
    if (hubActive || !enabled || timerMode !== "call_time" || !tableNumber) {
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (cancelled) return;

      socket = new WebSocket(localWsApi(`/ws/dealer/table/${tableNumber}/timer`));

      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(String(event.data)) as TimerMessage;
          if (data.type !== "dealer_timer" || data.tableNumber !== tableNumber) {
            return;
          }
          onTimerSnapshotRef.current(data.dealerTimer);
        } catch {
          // ignore malformed messages
        }
      });

      socket.addEventListener("close", () => {
        if (cancelled) return;
        reconnectTimer = window.setTimeout(connect, 400);
      });

      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [enabled, hubActive, tableNumber, timerMode]);
}
