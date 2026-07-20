/** Feature flags — default off preserves legacy HTTP behavior. */

export function isWsEnabled(): boolean {
  return import.meta.env.VITE_USE_WS === "true";
}

export function isDealerZonesEnabled(): boolean {
  return import.meta.env.VITE_DEALER_ZONES === "true";
}
