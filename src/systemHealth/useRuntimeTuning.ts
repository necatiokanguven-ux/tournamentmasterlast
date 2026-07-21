import { useCallback, useEffect, useState } from "react";
import { localApi } from "../config/api";
import {
  DEFAULT_RUNTIME_TUNING,
  getCachedRuntimeTuning,
  refreshRuntimeTuning,
  shouldRefreshRuntimeTuning,
  type RuntimeTuningValues,
} from "./runtimeTuningClient";

export function useRuntimeTuningPollMs(
  key: keyof RuntimeTuningValues,
  fallbackMs: number,
): number {
  const [pollMs, setPollMs] = useState(() => getCachedRuntimeTuning()[key] ?? fallbackMs);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (shouldRefreshRuntimeTuning()) {
        await refreshRuntimeTuning(localApi("/api/runtime/tuning"));
      }
      if (cancelled) return;
      const values = getCachedRuntimeTuning();
      setPollMs(values[key] ?? fallbackMs);
    };

    void sync();
    const timer = window.setInterval(() => {
      void sync();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [key, fallbackMs]);

  return pollMs || fallbackMs || DEFAULT_RUNTIME_TUNING[key];
}
