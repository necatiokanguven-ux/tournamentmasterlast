export type RuntimeTuningValues = {
  dealerTabletPollMs: number;
  dealerPhonePollMs: number;
  dealerControlPollMs: number;
  trackingPollMs: number;
  floorPollMs: number;
};

export const DEFAULT_RUNTIME_TUNING: RuntimeTuningValues = {
  dealerTabletPollMs: 500,
  dealerPhonePollMs: 1_000,
  dealerControlPollMs: 4_000,
  trackingPollMs: 10_000,
  floorPollMs: 1_000,
};

let cachedValues: RuntimeTuningValues = { ...DEFAULT_RUNTIME_TUNING };
let cachedLevel = 0;
let lastFetchAt = 0;

export function getCachedRuntimeTuning(): RuntimeTuningValues {
  return { ...cachedValues };
}

export function getCachedRuntimeTuningLevel(): number {
  return cachedLevel;
}

export async function refreshRuntimeTuning(fetchUrl = "/api/runtime/tuning"): Promise<RuntimeTuningValues> {
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) return cachedValues;
    const data = (await response.json()) as {
      values?: Partial<RuntimeTuningValues>;
      level?: number;
    };
    cachedValues = {
      ...DEFAULT_RUNTIME_TUNING,
      ...data.values,
    };
    cachedLevel = Number(data.level) || 0;
    lastFetchAt = Date.now();
    return cachedValues;
  } catch {
    return cachedValues;
  }
}

export function shouldRefreshRuntimeTuning(): boolean {
  return Date.now() - lastFetchAt > 25_000;
}
