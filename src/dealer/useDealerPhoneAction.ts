import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localApi } from "../config/api";
import { isWsEnabled } from "../config/featureFlags";
import { getDealerPhoneAction, type DealerPhoneAction } from "./dealerPhoneActions";
import { ensureDealerPhoneSession } from "./dealerSession";
import type { DealerNotification, DealerStaff } from "../server/dealerRotation/types";
import type { TournamentBreakStatus } from "../server/dealerRotation/RotationTriggerService";
import { useTournamentSocket } from "../websocket/useTournamentSocket";
import { isChannelPayloadMessage, type TournamentSocketServerMessage } from "../websocket/tournamentSocketTypes";

type DealerPhoneChannelPayload = {
  serverTime: number;
  tBreakMinutes: number;
  tournamentBreak: TournamentBreakStatus;
  dealer: DealerStaff | null;
  action: DealerPhoneAction;
};

export type DealerPhoneActionState = {
  action: DealerPhoneAction;
  dealer: DealerStaff | null;
  serverTime: number | undefined;
  tBreakMinutes: number;
  tournamentBreak: TournamentBreakStatus;
  loading: boolean;
};

const EMPTY_TOURNAMENT_BREAK: TournamentBreakStatus = {
  active: false,
  levelIndex: null,
  breakEndAt: null,
  durationMinutes: null,
};

const EMPTY: DealerPhoneActionState = {
  action: { kind: "none" },
  dealer: null,
  serverTime: undefined,
  tBreakMinutes: 15,
  tournamentBreak: EMPTY_TOURNAMENT_BREAK,
  loading: true,
};

const WS_FALLBACK_POLL_MS = 15_000;

export function useDealerPhoneAction(dealerId: string | null, pollMs = 1000): DealerPhoneActionState {
  const [state, setState] = useState<DealerPhoneActionState>(EMPTY);
  const wsEnabled = isWsEnabled();
  const channel = dealerId ? `dealer-phone:${dealerId}` : null;
  const sessionStartedRef = useRef(false);

  const applyPayload = useCallback((payload: DealerPhoneChannelPayload) => {
    setState({
      action: payload.action ?? { kind: "none" },
      dealer: payload.dealer,
      serverTime: payload.serverTime,
      tBreakMinutes: payload.tBreakMinutes,
      tournamentBreak: payload.tournamentBreak ?? EMPTY_TOURNAMENT_BREAK,
      loading: false,
    });
  }, []);

  const handleWsMessage = useCallback((message: TournamentSocketServerMessage) => {
    if (!channel || !isChannelPayloadMessage(message) || message.channel !== channel) return;
    applyPayload(message.payload as DealerPhoneChannelPayload);
  }, [applyPayload, channel]);

  const { connected: wsConnected } = useTournamentSocket({
    enabled: wsEnabled && Boolean(channel),
    channels: channel ? [channel] : [],
    onMessage: handleWsMessage,
  });

  const refresh = useCallback(async () => {
    if (!dealerId) {
      setState({
        action: { kind: "none" },
        dealer: null,
        serverTime: undefined,
        tBreakMinutes: 15,
        tournamentBreak: EMPTY_TOURNAMENT_BREAK,
        loading: false,
      });
      return;
    }

    try {
      const [stateRes, noteRes] = await Promise.all([
        fetch(localApi("/api/dealer-control/state")),
        fetch(localApi(`/api/dealer-control/notifications/${dealerId}`)),
      ]);
      if (!stateRes.ok) return;

      const data = await stateRes.json();
      const me = (data.rotation.staff as DealerStaff[]).find(s => s.id === dealerId) ?? null;

      let latestNote: DealerNotification | null = null;
      if (noteRes.ok) {
        const noteData = await noteRes.json();
        const notes = ((noteData.notifications ?? []) as DealerNotification[])
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        latestNote = notes[0] ?? null;
      }

      const tBreakMinutes = Number(data.rotation?.settings?.tBreakMinutes) || 15;
      const tournamentBreak = (data.tournamentBreak ?? EMPTY_TOURNAMENT_BREAK) as TournamentBreakStatus;

      setState({
        action: me ? getDealerPhoneAction(me, latestNote, { tournamentBreak }) : { kind: "none" },
        dealer: me,
        serverTime: typeof data.serverTime === "number" ? data.serverTime : undefined,
        tBreakMinutes,
        tournamentBreak,
        loading: false,
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [dealerId]);

  useEffect(() => {
    sessionStartedRef.current = false;
  }, [dealerId]);

  useEffect(() => {
    if (!dealerId) return;
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    void ensureDealerPhoneSession(dealerId);
  }, [dealerId]);

  const effectivePollMs = useMemo(() => {
    if (!wsEnabled) return pollMs;
    return wsConnected ? WS_FALLBACK_POLL_MS : pollMs;
  }, [pollMs, wsConnected, wsEnabled]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), effectivePollMs);
    return () => window.clearInterval(timer);
  }, [effectivePollMs, refresh]);

  return state;
}

export function hasActiveDealerDuty(action: DealerPhoneAction): boolean {
  return action.kind !== "none";
}
