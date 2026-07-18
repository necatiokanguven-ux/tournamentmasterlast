import { useCallback, useEffect, useRef, useState } from "react";
import { localApi } from "../config/api";

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

export type DealerTableSnapshot = {
  version: number;
  tableNumber: number;
  tableId: string;
  tournamentName: string;
  seats: DealerSeatSnapshot[];
  timerSettings: {
    callTimeSeconds: number;
    playerTimeSeconds: number;
  };
  clock: {
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
  };
};

const POLL_INTERVAL_MS = 2000;

export function useDealerTablePoll(tableNumber: number | null, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<DealerTableSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clockRunningRef = useRef(false);

  const fetchSnapshot = useCallback(async () => {
    if (!tableNumber) return;

    try {
      const response = await fetch(localApi(`/api/dealer/table/${tableNumber}`));
      if (!response.ok) {
        throw new Error(response.status === 404 ? "Table not found." : "Failed to load table data.");
      }

      const data = (await response.json()) as DealerTableSnapshot;
      setSnapshot(data);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load table data.");
    }
  }, [tableNumber]);

  useEffect(() => {
    clockRunningRef.current = Boolean(snapshot?.clock.isRunning);
  }, [snapshot?.clock.isRunning]);

  useEffect(() => {
    if (!enabled || !tableNumber) {
      setSnapshot(null);
      setError(null);
      return;
    }

    void fetchSnapshot();
    const pollTimer = window.setInterval(() => {
      void fetchSnapshot();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [enabled, tableNumber, fetchSnapshot]);

  useEffect(() => {
    if (!enabled || !tableNumber) return;

    const tickTimer = window.setInterval(() => {
      setSnapshot((current) => {
        if (!current || !clockRunningRef.current || current.clock.timeRemaining <= 0) {
          return current;
        }

        return {
          ...current,
          clock: {
            ...current.clock,
            timeRemaining: current.clock.timeRemaining - 1,
          },
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(tickTimer);
    };
  }, [enabled, tableNumber]);

  return { snapshot, error, refresh: fetchSnapshot };
}
