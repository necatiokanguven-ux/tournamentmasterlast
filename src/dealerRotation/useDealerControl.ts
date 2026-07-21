import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localApi } from "../config/api";
import { isDealerZonesEnabled, isWsEnabled } from "../config/featureFlags";
import type { CoverageSummary } from "./dealerCoverageUtils";
import type { DealerRotationData } from "../server/dealerRotation/types";
import { useTournamentSocket } from "../websocket/useTournamentSocket";
import { isChannelPayloadMessage, type TournamentSocketServerMessage } from "../websocket/tournamentSocketTypes";

import { useRuntimeTuningPollMs } from "../systemHealth/useRuntimeTuning";

type DealerControlChannelPayload = {
  rotation: DealerRotationData;
  tables: DealerTableState[];
  staffTiming: DealerStaffTiming[];
  serverTime: number;
  coverageSummary: CoverageSummary | null;
  zoneVersion?: number;
};

export type DealerTableState = {
  id: string;
  number: number;
  dealerId: string | null;
  dealerName: string | null;
  dealerState: string | null;
  currentTableDealSeconds: number;
  rotationRemainingSeconds: number | null;
  needsDealer: boolean;
};

export type DealerStaffTiming = {
  id: string;
  sessionDealSeconds: number;
  sessionBreakSeconds: number;
  currentTableDealSeconds: number;
};

export type DealerControlState = {
  rotation: DealerRotationData;
  tables: DealerTableState[];
  staffTiming: DealerStaffTiming[];
  checkInUrl: string | null;
  serverTime: number;
  coverageSummary: CoverageSummary | null;
  dealerZones: import("../types").DealerZone[];
  zonesEnabled: boolean;
  zoneVersion: number;
};

const EMPTY: DealerControlState = {
  rotation: {
    settings: { enabled: false, tDealMinutes: 30, tBreakMinutes: 30, autoAssign: true, lastBreakLevelIndex: null, activeTournamentBreakLevelIndex: null, customStaffRoles: [], handoffFrozen: false, workHourAwareAssign: true, level1FairOrder: true },
    staff: [],
    poolQueue: [],
    waitingList: [],
    workLog: [],
    notifications: [],
    operatorAlerts: [],
    dismissedOperatorAlertKeys: [],
  },
  tables: [],
  staffTiming: [],
  checkInUrl: null,
  serverTime: Date.now(),
  coverageSummary: null,
  dealerZones: [],
  zonesEnabled: false,
  zoneVersion: 0,
};

const WS_FALLBACK_POLL_MS = 15_000;

function resolveDealerControlZoneId(): string | null {
  if (!isDealerZonesEnabled()) return null;
  const zoneId = new URLSearchParams(window.location.search).get("zone")?.trim();
  return zoneId || null;
}

function dealerControlChannelForZone(zoneId: string | null): string {
  return zoneId ? `dealer-control:${zoneId}` : "dealer-control";
}

export function useDealerControl(pollMs = 4000) {
  const tuningPollMs = useRuntimeTuningPollMs("dealerControlPollMs", pollMs);
  const basePollMs = Math.max(pollMs, tuningPollMs);
  const [state, setState] = useState<DealerControlState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsEnabled = isWsEnabled();
  const zoneId = useMemo(() => resolveDealerControlZoneId(), []);
  const dealerControlChannel = useMemo(() => dealerControlChannelForZone(zoneId), [zoneId]);
  const zoneVersionRef = useRef(0);

  const applyPayload = useCallback((payload: DealerControlChannelPayload) => {
    const nextVersion = payload.zoneVersion ?? zoneVersionRef.current;
    zoneVersionRef.current = nextVersion;
    setState(prev => ({
      rotation: payload.rotation,
      tables: payload.tables ?? [],
      staffTiming: payload.staffTiming ?? [],
      checkInUrl: prev.checkInUrl,
      serverTime: payload.serverTime ?? Date.now(),
      coverageSummary: payload.coverageSummary ?? null,
      dealerZones: prev.dealerZones,
      zonesEnabled: prev.zonesEnabled,
      zoneVersion: nextVersion,
    }));
    setError(null);
    setLoading(false);
  }, []);

  const handleWsMessage = useCallback((message: TournamentSocketServerMessage) => {
    if (!isChannelPayloadMessage(message) || message.channel !== dealerControlChannel) return;
    applyPayload(message.payload as DealerControlChannelPayload);
  }, [applyPayload, dealerControlChannel]);

  const { connected: wsConnected } = useTournamentSocket({
    enabled: wsEnabled,
    channels: [dealerControlChannel],
    onMessage: handleWsMessage,
  });

  const effectivePollMs = useMemo(() => {
    if (!wsEnabled) return basePollMs;
    return wsConnected ? Math.max(WS_FALLBACK_POLL_MS, basePollMs) : basePollMs;
  }, [basePollMs, wsConnected, wsEnabled]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const zoneQuery = zoneId ? `?zone=${encodeURIComponent(zoneId)}` : "";
      const response = await fetch(localApi(`/api/dealer-control/state${zoneQuery}`));
      if (!response.ok) throw new Error("Dealer control unavailable.");
      const data = await response.json();
      setState({
        rotation: data.rotation,
        tables: data.tables ?? [],
        staffTiming: data.staffTiming ?? [],
        checkInUrl: data.checkInUrl ?? null,
        serverTime: data.serverTime ?? Date.now(),
        coverageSummary: data.coverageSummary ?? null,
        dealerZones: data.dealerZones ?? [],
        zonesEnabled: Boolean(data.zonesEnabled),
        zoneVersion: Number(data.zoneVersion) || 0,
      });
      zoneVersionRef.current = Number(data.zoneVersion) || zoneVersionRef.current;
      setError(null);
    } catch (loadError) {
      if (!silent) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dealer control.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), effectivePollMs);
    return () => window.clearInterval(timer);
  }, [effectivePollMs, refresh]);

  const zoneQuerySuffix = useCallback(() => {
    const parts: string[] = [];
    if (zoneId) parts.push(`zone=${encodeURIComponent(zoneId)}`);
    if (zoneId && zoneVersionRef.current > 0) {
      parts.push(`zoneVersion=${zoneVersionRef.current}`);
    }
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }, [zoneId]);

  const apiPost = async (path: string, body?: unknown) => {
    const payload = {
      ...(body && typeof body === "object" ? body : {}),
      ...(zoneId ? { zoneVersion: zoneVersionRef.current } : {}),
    };
    const response = await fetch(localApi(`/api/dealer-control${path}${zoneQuerySuffix()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 409) {
      await refresh(true);
      throw new Error("Another operator updated this zone. Data refreshed — retry.");
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || data.message || "Request failed.");
    }
    await refresh(true);
    return response.json();
  };

  const apiPut = async (path: string, body: unknown) => {
    const response = await fetch(localApi(`/api/dealer-control${path}${zoneQuerySuffix()}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(body && typeof body === "object" ? body : {}),
        ...(zoneId ? { zoneVersion: zoneVersionRef.current } : {}),
      }),
    });
    if (response.status === 409) {
      await refresh(true);
      throw new Error("Another operator updated this zone. Data refreshed — retry.");
    }
    if (!response.ok) throw new Error("Save failed.");
    await refresh(true);
    return response.json();
  };

  const apiDelete = async (path: string) => {
    const response = await fetch(localApi(`/api/dealer-control${path}${zoneQuerySuffix()}`), { method: "DELETE" });
    if (response.status === 409) {
      await refresh(true);
      throw new Error("Another operator updated this zone. Data refreshed — retry.");
    }
    if (!response.ok) throw new Error("Delete failed.");
    await refresh(true);
  };

  return {
    state,
    loading,
    error,
    refresh,
    saveSettings: (settings: Partial<DealerRotationData["settings"]>) => apiPut("/settings", settings),
    dismissOperatorAlert: (fingerprint: string) => apiPost("/alerts/dismiss", { fingerprint }),
    addStaff: (staff: Record<string, unknown>) => apiPost("/staff", staff),
    removeStaff: (dealerId: string) => apiDelete(`/staff/${dealerId}`),
    initialize: () => apiPost("/initialize"),
    assignDealer: (dealerId: string, tableId: string) => apiPost("/assign", { dealerId, tableId }),
    moveToWaiting: (dealerId: string) => apiPost(`/move-to-waiting/${dealerId}`),
    sendToBreak: (dealerId: string) => apiPost(`/send-to-break/${dealerId}`),
    sendToPool: (dealerId: string) => apiPost(`/send-to-pool/${dealerId}`),
    emergencyCall: (dealerId: string) => apiPost(`/emergency-call/${dealerId}`),
    setStaffShift: (dealerId: string, active: boolean) => apiPost(`/staff/${dealerId}/shift`, { active }),
    setStaffZone: (dealerId: string, zoneId: string | null) => apiPost(`/staff/${dealerId}/zone`, { zoneId }),
  };
}
