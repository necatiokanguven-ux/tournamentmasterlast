import type { TournamentSocketHub } from "../websocket/TournamentSocketHub";
import { getRuntimeTuningState, setThrottleLevel, type ThrottleLevel } from "./runtimeTuning";

export type VenueDeviceMode = "on" | "limited" | "off";

let mode: VenueDeviceMode = "on";
let limitedThrottlePinned = false;

export function getVenueDeviceMode(): VenueDeviceMode {
  return mode;
}

export function isMobileApiPath(path: string): boolean {
  return (
    path.startsWith("/api/dealer")
    || path.startsWith("/api/floor")
    || (path.startsWith("/api/tracking") && path !== "/api/tracking/ping")
    || path.startsWith("/api/dealer-control")
  );
}

export function isMobileRegistrationPath(path: string, method: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  return (
    path.includes("/register")
    || path === "/api/dealer-control/phone/session/start"
    || path === "/api/dealer-control/phone/rehydrate"
    || path === "/api/dealer-control/checkin"
  );
}

export function isMobileWsChannel(channel: string): boolean {
  return (
    channel.startsWith("dealer-phone:")
    || channel.startsWith("floor:")
    || channel.startsWith("dealer-timer:")
  );
}

export function isVenueDeviceModeBlocking(mode: VenueDeviceMode = mode): boolean {
  return mode === "off" || mode === "limited";
}

export type ApplyVenueDeviceModeOptions = {
  hub: TournamentSocketHub | null;
  disconnectLegacyDealerTimers: () => void;
};

export function applyVenueDeviceMode(
  next: VenueDeviceMode,
  options: ApplyVenueDeviceModeOptions,
): VenueDeviceMode {
  mode = next;

  if (next === "off") {
    options.hub?.disconnectMobileClients("Venue mobile devices disabled by operator");
    options.disconnectLegacyDealerTimers();
  }

  if (next === "limited") {
    const current = getRuntimeTuningState().level;
    if (current < 2) {
      setThrottleLevel(2 as ThrottleLevel);
      limitedThrottlePinned = true;
    }
  }

  if (next === "on" && limitedThrottlePinned) {
    setThrottleLevel(0);
    limitedThrottlePinned = false;
  }

  return mode;
}
