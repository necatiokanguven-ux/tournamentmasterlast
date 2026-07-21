import {
  computeDealerTimerRemaining,
  createDefaultDealerTimerState,
  DEALER_DEVICE_STALE_MS,
  MAX_DEALER_DEVICES_PER_TABLE,
  normalizeExpiredDealerTimer,
  toDealerTimerSnapshot,
  type DealerDeviceSession,
  type DealerTimerAction,
  type DealerTimerSnapshot,
  type DealerTimerState,
} from "./dealerTimerTypes";

function createRunningTimer(
  current: DealerTimerState,
  now: number,
  mode: DealerTimerState["mode"],
  duration: number,
): DealerTimerState {
  const totalSeconds = Math.max(1, Math.round(duration));
  const startedAtMs = now;

  return {
    ...current,
    mode,
    state: "running",
    startedAtMs,
    endTimeMs: startedAtMs + totalSeconds * 1000,
    pausedRemainingSeconds: 0,
    totalSeconds,
  };
}

type TableRuntime = {
  timer: DealerTimerState;
  devices: DealerDeviceSession[];
};

const runtimeByTable = new Map<number, TableRuntime>();

function getTableRuntime(tableNumber: number): TableRuntime {
  const existing = runtimeByTable.get(tableNumber);
  if (existing) {
    return existing;
  }

  const created: TableRuntime = {
    timer: createDefaultDealerTimerState(),
    devices: [],
  };
  runtimeByTable.set(tableNumber, created);
  return created;
}

function pruneStaleDevices(devices: DealerDeviceSession[], now: number): DealerDeviceSession[] {
  return devices.filter((device) => now - device.lastSeenMs <= DEALER_DEVICE_STALE_MS);
}

function touchDevice(runtime: TableRuntime, deviceId: string, now: number): boolean {
  runtime.devices = pruneStaleDevices(runtime.devices, now);
  const existing = runtime.devices.find((device) => device.deviceId === deviceId);

  if (existing) {
    existing.lastSeenMs = now;
    return true;
  }

  if (runtime.devices.length >= MAX_DEALER_DEVICES_PER_TABLE) {
    return false;
  }

  runtime.devices.push({
    deviceId,
    lastSeenMs: now,
    registeredAt: new Date(now).toISOString(),
  });
  return true;
}

function bumpTimer(runtime: TableRuntime, next: DealerTimerState, now: number) {
  runtime.timer = {
    ...next,
    revision: runtime.timer.revision + 1,
    updatedAt: new Date(now).toISOString(),
  };
}

export function registerDealerDevice(
  tableNumber: number,
  deviceId: string,
): { ok: true; connectedDevices: number } | { ok: false; error: string } {
  const trimmed = deviceId.trim();
  if (!trimmed) {
    return { ok: false, error: "DEVICE_ID_REQUIRED" };
  }

  const now = Date.now();
  const runtime = getTableRuntime(tableNumber);
  const allowed = touchDevice(runtime, trimmed, now);

  if (!allowed) {
    return { ok: false, error: "DEVICE_LIMIT" };
  }

  runtime.devices = pruneStaleDevices(runtime.devices, now);
  return { ok: true, connectedDevices: runtime.devices.length };
}

export function heartbeatDealerDevice(
  tableNumber: number,
  deviceId: string | null,
): { connectedDevices: number; deviceAccepted: boolean } {
  const runtime = getTableRuntime(tableNumber);
  const now = Date.now();
  runtime.devices = pruneStaleDevices(runtime.devices, now);

  if (!deviceId?.trim()) {
    return { connectedDevices: runtime.devices.length, deviceAccepted: false };
  }

  const existing = runtime.devices.find((device) => device.deviceId === deviceId);
  if (!existing) {
    return { connectedDevices: runtime.devices.length, deviceAccepted: false };
  }

  existing.lastSeenMs = now;
  return { connectedDevices: runtime.devices.length, deviceAccepted: true };
}

export function getDealerTimerSnapshot(tableNumber: number): DealerTimerSnapshot {
  const runtime = getTableRuntime(tableNumber);
  const now = Date.now();
  runtime.devices = pruneStaleDevices(runtime.devices, now);
  runtime.timer = normalizeExpiredDealerTimer(runtime.timer, now);
  return toDealerTimerSnapshot(runtime.timer, now);
}

export function applyDealerTimerAction(
  tableNumber: number,
  deviceId: string,
  action: DealerTimerAction,
  durations: { callTimeSeconds: number; playerTimeSeconds: number },
): { ok: true; timer: DealerTimerSnapshot } | { ok: false; error: string } {
  const trimmed = deviceId.trim();
  if (!trimmed) {
    return { ok: false, error: "DEVICE_ID_REQUIRED" };
  }

  const now = Date.now();
  const runtime = getTableRuntime(tableNumber);
  runtime.devices = pruneStaleDevices(runtime.devices, now);

  const registered = runtime.devices.some((device) => device.deviceId === trimmed);
  if (!registered) {
    return { ok: false, error: "DEVICE_NOT_REGISTERED" };
  }

  runtime.timer = normalizeExpiredDealerTimer(runtime.timer, now);
  const current = runtime.timer;

  let next: DealerTimerState;

  switch (action) {
    case "start_call":
      next = createRunningTimer(current, now, "call_time", durations.callTimeSeconds);
      break;
    case "start_player":
      next = createRunningTimer(current, now, "player_time", durations.playerTimeSeconds);
      break;
    case "pause": {
      if (current.state !== "running" || current.endTimeMs === null) {
        return { ok: false, error: "TIMER_NOT_RUNNING" };
      }
      next = {
        ...current,
        state: "paused",
        endTimeMs: null,
        startedAtMs: null,
        pausedRemainingSeconds: computeDealerTimerRemaining(current, now),
      };
      break;
    }
    case "resume": {
      if (current.state !== "paused" || current.pausedRemainingSeconds <= 0) {
        return { ok: false, error: "TIMER_NOT_PAUSED" };
      }
      next = createRunningTimer(current, now, current.mode, current.pausedRemainingSeconds);
      break;
    }
    case "reset":
      next = createDefaultDealerTimerState();
      next.revision = current.revision;
      break;
    default:
      return { ok: false, error: "INVALID_ACTION" };
  }

  bumpTimer(runtime, next, now);
  runtime.devices.find((device) => device.deviceId === trimmed)!.lastSeenMs = now;

  return { ok: true, timer: toDealerTimerSnapshot(runtime.timer, now) };
}

export function resetDealerTimerForTable(tableNumber: number): void {
  const runtime = getTableRuntime(tableNumber);
  const now = Date.now();
  const next = createDefaultDealerTimerState();
  next.revision = runtime.timer.revision;
  bumpTimer(runtime, next, now);
}

export function countActiveDealerTablets(): number {
  const now = Date.now();
  let count = 0;
  for (const runtime of runtimeByTable.values()) {
    runtime.devices = pruneStaleDevices(runtime.devices, now);
    count += runtime.devices.length;
  }
  return count;
}

export function resetDealerTimerForAllTables(): void {
  for (const tableNumber of runtimeByTable.keys()) {
    resetDealerTimerForTable(tableNumber);
  }
}
