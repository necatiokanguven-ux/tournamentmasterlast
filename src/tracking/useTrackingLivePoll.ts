import { useCallback, useEffect, useState } from "react";
import { localApi } from "../config/api";
import { mergeTrackingLiveState, type TrackingLiveState } from "./liveState";
import { TRACKING_LIVE_POLL_MS } from "./trackingPollConfig";

export function useTrackingLivePoll(enabled: boolean) {
  const [liveState, setLiveState] = useState<TrackingLiveState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveState = useCallback(async () => {
    try {
      const response = await fetch(localApi("/api/tracking/live"));
      if (!response.ok) {
        throw new Error("Live tracking request failed.");
      }

      const data = (await response.json()) as TrackingLiveState;
      setLiveState((current) => {
        try {
          return mergeTrackingLiveState(current, data);
        } catch (mergeError) {
          console.error("Failed to merge tracking live state", mergeError);
          return current;
        }
      });
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Live tracking request failed.");
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLiveState(null);
      setError(null);
      return;
    }

    void fetchLiveState();
    const pollTimer = window.setInterval(() => {
      void fetchLiveState();
    }, TRACKING_LIVE_POLL_MS);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [enabled, fetchLiveState]);

  return { liveState, error, refresh: fetchLiveState };
}
