import { useCallback, useEffect, useMemo, useState } from "react";
import { localApi } from "../config/api";
import type { DealerTimerModeSetting } from "../types";
import { mergeTrackingLiveState, type TrackingLiveState } from "../tracking/liveState";
import type { DealerTimerSnapshot } from "./dealerTimerTypes";

export type DealerSeatSnapshot = {
  seatNumber: number;
  seatIndex: number;
  playerId: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  country: string | null;
  status: string | null;
  isOpen: boolean;
};

export type DealerClockSnapshot = {
  timeRemaining: number;
  isRunning: boolean;
  currentLevelIndex: number;
  currentLevel: number;
  isBreak: boolean;
  currentBlinds: string;
  nextBlinds: string | null;
  nextBreak: string;
  remainingPlayers: number;
  totalPlayers: number;
  playersDisplay: string;
  serverTime: string;
};

export type DealerTableSnapshot = {
  version: number;
  tableNumber: number;
  tableId: string;
  tournamentName: string;
  dealerId: string | null;
  dealerName: string | null;
  dealerState: string | null;
  dealerDealSeconds: number;
  dealerRotationRemainingSeconds: number | null;
  dealerDealStartedAt: string | null;
  dealerDealEndAt: string | null;
  rotationTDealMinutes: number;
  seats: DealerSeatSnapshot[];
  timerSettings: {
    mode: DealerTimerModeSetting;
    callTimeSeconds: number;
    playerTimeSeconds: number;
  };
  dealerTimer: DealerTimerSnapshot;
  connectedDevices: number;
  clock: DealerClockSnapshot;
};

type DealerTablePayload = {
  version: number;
  tableNumber: number;
  tableId: string;
  tournamentName: string;
  dealerId?: string | null;
  dealerName?: string | null;
  dealerState?: string | null;
  dealerDealSeconds?: number;
  dealerRotationRemainingSeconds?: number | null;
  dealerDealStartedAt?: string | null;
  dealerDealEndAt?: string | null;
  rotationTDealMinutes?: number;
  seats: DealerSeatSnapshot[];
  timerSettings: {
    mode: DealerTimerModeSetting;
    callTimeSeconds: number;
    playerTimeSeconds: number;
  };
  dealerTimer?: DealerTimerSnapshot;
  connectedDevices?: number;
};

const LIVE_POLL_MS = 500;
const TABLE_POLL_MS = 500;

function mapLiveToDealerClock(live: TrackingLiveState): DealerClockSnapshot {
  return {
    timeRemaining: live.timeRemaining,
    isRunning: live.isRunning,
    currentLevelIndex: live.currentLevelIndex,
    currentLevel: live.currentLevel,
    isBreak: live.isBreak,
    currentBlinds: live.currentBlinds,
    nextBlinds: live.nextBlinds,
    nextBreak: live.nextBreak,
    remainingPlayers: live.remainingPlayers,
    totalPlayers: live.totalPlayers,
    playersDisplay: live.playersDisplay,
    serverTime: live.serverTime,
  };
}

export function useDealerTablePoll(
  tableNumber: number | null,
  enabled: boolean,
  deviceId: string | null,
) {
  const [liveState, setLiveState] = useState<TrackingLiveState | null>(null);
  const [tableData, setTableData] = useState<DealerTablePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState(0);
  const [dealerTimer, setDealerTimer] = useState<DealerTimerSnapshot | null>(null);

  const fetchLiveState = useCallback(async () => {
    try {
      const response = await fetch(localApi("/api/tracking/live"));
      if (!response.ok) {
        throw new Error("Failed to load tournament clock.");
      }

      const data = (await response.json()) as TrackingLiveState;
      setLiveState((current) => {
        try {
          return mergeTrackingLiveState(current, data);
        } catch (mergeError) {
          console.error("Failed to merge dealer live clock state", mergeError);
          return current ?? data;
        }
      });
      setLiveLoaded(true);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load tournament clock.");
    }
  }, []);

  const fetchTableData = useCallback(async () => {
    if (!tableNumber) return;

    try {
      const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
      const response = await fetch(localApi(`/api/dealer/table/${tableNumber}${query}`));
      if (!response.ok) {
        throw new Error(response.status === 404 ? "Table not found." : "Failed to load table data.");
      }

      const data = (await response.json()) as DealerTablePayload & {
        clock?: unknown;
        dealerTimer?: DealerTimerSnapshot;
        connectedDevices?: number;
      };
      setTableData({
        version: data.version,
        tableNumber: data.tableNumber,
        tableId: data.tableId,
        tournamentName: data.tournamentName,
        dealerId: data.dealerId ?? null,
        dealerName: data.dealerName ?? null,
        dealerState: data.dealerState ?? null,
        dealerDealSeconds: data.dealerDealSeconds ?? 0,
        dealerRotationRemainingSeconds: data.dealerRotationRemainingSeconds ?? null,
        dealerDealStartedAt: data.dealerDealStartedAt ?? null,
        dealerDealEndAt: data.dealerDealEndAt ?? null,
        rotationTDealMinutes: data.rotationTDealMinutes ?? 30,
        seats: data.seats ?? [],
        timerSettings: data.timerSettings ?? {
          mode: "call_time",
          callTimeSeconds: 30,
          playerTimeSeconds: 60,
        },
        dealerTimer: data.dealerTimer,
        connectedDevices: data.connectedDevices,
      });
      if (data.dealerTimer) {
        setDealerTimer((current) =>
          current && current.revision === data.dealerTimer!.revision ? current : data.dealerTimer!,
        );
      }
      if (typeof data.connectedDevices === "number") {
        setConnectedDevices(data.connectedDevices);
      }
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load table data.");
    }
  }, [tableNumber, deviceId]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchLiveState(), fetchTableData()]);
  }, [fetchLiveState, fetchTableData]);

  const applyDealerTimerSnapshot = useCallback((timer: DealerTimerSnapshot) => {
    setDealerTimer(timer);
    setTableData((current) => (current ? { ...current, dealerTimer: timer } : current));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLiveState(null);
      setTableData(null);
      setDealerTimer(null);
      setConnectedDevices(0);
      setError(null);
      setLiveLoaded(false);
      return;
    }

    void fetchLiveState();
    const liveTimer = window.setInterval(() => {
      void fetchLiveState();
    }, LIVE_POLL_MS);

    return () => {
      window.clearInterval(liveTimer);
    };
  }, [enabled, fetchLiveState]);

  useEffect(() => {
    if (!enabled || !tableNumber) {
      return;
    }

    void fetchTableData();
    const tableTimer = window.setInterval(() => {
      void fetchTableData();
    }, TABLE_POLL_MS);

    return () => {
      window.clearInterval(tableTimer);
    };
  }, [enabled, tableNumber, fetchTableData]);

  const snapshot = useMemo<DealerTableSnapshot | null>(() => {
    if (!liveState) {
      return null;
    }

    return {
      version: tableData?.version ?? liveState.version,
      tableNumber: tableData?.tableNumber ?? tableNumber ?? 0,
      tableId: tableData?.tableId ?? "",
      tournamentName: liveState.tournamentName || tableData?.tournamentName || "Tournament",
      dealerId: tableData?.dealerId ?? null,
      dealerName: tableData?.dealerName ?? null,
      dealerState: tableData?.dealerState ?? null,
      dealerDealSeconds: tableData?.dealerDealSeconds ?? 0,
      dealerRotationRemainingSeconds: tableData?.dealerRotationRemainingSeconds ?? null,
      dealerDealStartedAt: tableData?.dealerDealStartedAt ?? null,
      dealerDealEndAt: tableData?.dealerDealEndAt ?? null,
      rotationTDealMinutes: tableData?.rotationTDealMinutes ?? 30,
      seats: tableData?.seats ?? [],
      timerSettings: tableData?.timerSettings ?? {
        mode: "call_time",
        callTimeSeconds: 30,
        playerTimeSeconds: 60,
      },
      dealerTimer: dealerTimer ?? tableData?.dealerTimer ?? {
        mode: "idle",
        state: "stopped",
        endTimeMs: null,
        startedAtMs: null,
        pausedRemainingSeconds: 0,
        totalSeconds: 0,
        revision: 0,
        updatedAt: new Date(0).toISOString(),
        secondsRemaining: 0,
      },
      connectedDevices: connectedDevices || tableData?.connectedDevices || 0,
      clock: mapLiveToDealerClock(liveState),
    };
  }, [connectedDevices, dealerTimer, liveState, tableData, tableNumber]);

  const isLoading = !liveLoaded;

  return { snapshot, dealerTimer, connectedDevices, error, isLoading, refresh, applyDealerTimerSnapshot };
}
