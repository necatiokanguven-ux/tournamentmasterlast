export type ThrottleLevel = 0 | 1 | 2 | 3;

export type RuntimeTuningValues = {
  dealerTabletPollMs: number;
  dealerPhonePollMs: number;
  dealerControlPollMs: number;
  trackingPollMs: number;
  floorPollMs: number;
};

export type RuntimeTuningState = {
  enabled: boolean;
  level: ThrottleLevel;
  values: RuntimeTuningValues;
  normalValues: RuntimeTuningValues;
  updatedAt: number;
};

const NORMAL: RuntimeTuningValues = {
  dealerTabletPollMs: 500,
  dealerPhonePollMs: 1_000,
  dealerControlPollMs: 4_000,
  trackingPollMs: 10_000,
  floorPollMs: 1_000,
};

const LEVELS: Record<ThrottleLevel, RuntimeTuningValues> = {
  0: NORMAL,
  1: {
    dealerTabletPollMs: 1_000,
    dealerPhonePollMs: 3_000,
    dealerControlPollMs: 6_000,
    trackingPollMs: 12_000,
    floorPollMs: 2_000,
  },
  2: {
    dealerTabletPollMs: 2_000,
    dealerPhonePollMs: 10_000,
    dealerControlPollMs: 10_000,
    trackingPollMs: 15_000,
    floorPollMs: 4_000,
  },
  3: {
    dealerTabletPollMs: 3_000,
    dealerPhonePollMs: 15_000,
    dealerControlPollMs: 12_000,
    trackingPollMs: 20_000,
    floorPollMs: 5_000,
  },
};

let state: RuntimeTuningState = {
  enabled: process.env.AUTO_PROTECTION_ENABLED !== "false",
  level: 0,
  values: { ...NORMAL },
  normalValues: { ...NORMAL },
  updatedAt: Date.now(),
};

export function isAutoProtectionEnabled(): boolean {
  return state.enabled;
}

export function getRuntimeTuningState(): RuntimeTuningState {
  return {
    ...state,
    values: { ...state.values },
    normalValues: { ...state.normalValues },
  };
}

export function setThrottleLevel(level: ThrottleLevel): RuntimeTuningState {
  state = {
    ...state,
    level,
    values: { ...LEVELS[level] },
    updatedAt: Date.now(),
  };
  return getRuntimeTuningState();
}

export function getNormalTuningValues(): RuntimeTuningValues {
  return { ...NORMAL };
}

export function describeTuningChange(fromLevel: ThrottleLevel, toLevel: ThrottleLevel): string {
  if (fromLevel === toLevel) return "No poll change";
  const from = LEVELS[fromLevel];
  const to = LEVELS[toLevel];
  if (toLevel > fromLevel) {
    return `Tablet ${from.dealerTabletPollMs}→${to.dealerTabletPollMs}ms, Phone ${from.dealerPhonePollMs}→${to.dealerPhonePollMs}ms, QR ${from.trackingPollMs}→${to.trackingPollMs}ms`;
  }
  return `Tablet ${from.dealerTabletPollMs}→${to.dealerTabletPollMs}ms, Phone ${from.dealerPhonePollMs}→${to.dealerPhonePollMs}ms, QR ${from.trackingPollMs}→${to.trackingPollMs}ms (recovery)`;
}
