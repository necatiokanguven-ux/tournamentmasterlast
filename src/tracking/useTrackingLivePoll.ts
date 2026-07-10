import { useCallback, useEffect, useRef, useState } from "react";
import { mergeTrackingLiveState, type TrackingLiveState } from "./liveState";

const POLL_INTERVAL_MS = 2000;

export function useTrackingLivePoll(enabled: boolean) {
  const [liveState, setLiveState] = useState<TrackingLiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRunningRef = useRef(false);

  const fetchLiveState = useCallback(async () => {
    try {
      const response = await fetch("/api/tracking/live");
      if (!response.ok) {
        throw new Error("Live tracking request failed.");
      }

      const data = (await response.json()) as TrackingLiveState;
      setLiveState((current) => mergeTrackingLiveState(current, data));
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Live tracking request failed.");
    }
  }, []);

  useEffect(() => {
    isRunningRef.current = Boolean(liveState?.isRunning);
  }, [liveState?.isRunning]);

  useEffect(() => {
    if (!enabled) {
      setLiveState(null);
      setError(null);
      return;
    }

    void fetchLiveState();
    const pollTimer = window.setInterval(() => {
      void fetchLiveState();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [enabled, fetchLiveState]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tickTimer = window.setInterval(() => {
      setLiveState((current) => {
        if (!current || !isRunningRef.current || current.timeRemaining <= 0) {
          return current;
        }

        return {
          ...current,
          timeRemaining: current.timeRemaining - 1,
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(tickTimer);
    };
  }, [enabled]);

  return { liveState, error, refresh: fetchLiveState };
}
