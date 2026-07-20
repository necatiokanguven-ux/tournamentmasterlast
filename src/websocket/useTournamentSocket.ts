import { useEffect, useRef, useState } from "react";
import { localWsApi } from "../config/api";
import { isWsEnabled } from "../config/featureFlags";
import {
  parseServerMessage,
  TOURNAMENT_WS_PATH,
  type TournamentSocketServerMessage,
} from "./tournamentSocketTypes";

type UseTournamentSocketOptions = {
  channels?: string[];
  enabled?: boolean;
  onMessage?: (message: TournamentSocketServerMessage) => void;
};

type TournamentSocketState = {
  connected: boolean;
  enabled: boolean;
  reconnecting: boolean;
  lastError: string | null;
};

const RECONNECT_MS = 3000;

export function useTournamentSocket(options: UseTournamentSocketOptions = {}): TournamentSocketState {
  const enabled = options.enabled ?? isWsEnabled();
  const channels = options.channels ?? [];
  const onMessage = options.onMessage;

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const channelsRef = useRef(channels);
  const onMessageRef = useRef(onMessage);

  channelsRef.current = channels;
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      setReconnecting(false);
      setLastError(null);
      return;
    }

    let cancelled = false;

    const subscribeAll = (socket: WebSocket) => {
      for (const channel of channelsRef.current) {
        socket.send(JSON.stringify({ type: "subscribe", channel }));
      }
    };

    const connect = () => {
      if (cancelled) return;

      const socket = new WebSocket(localWsApi(TOURNAMENT_WS_PATH));
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setReconnecting(false);
        setLastError(null);
        subscribeAll(socket);
      };

      socket.onmessage = (event) => {
        const message = parseServerMessage(String(event.data));
        if (!message) return;
        onMessageRef.current?.(message);
      };

      socket.onerror = () => {
        if (cancelled) return;
        setLastError("WebSocket connection error");
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        setReconnecting(true);
        socketRef.current = null;
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      setReconnecting(false);
    };
  }, [enabled]);

  return { connected, enabled, reconnecting, lastError };
}
