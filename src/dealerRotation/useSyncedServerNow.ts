import { useEffect, useRef, useState } from "react";

/**
 * Maps client ticks to server time using the offset from the latest API poll.
 * Avoids wrong break/deal countdowns when the phone clock is off.
 */
export function useSyncedServerNow(serverTimeMs: number | undefined): number {
  const offsetRef = useRef(0);
  const [clientNow, setClientNow] = useState(() => Date.now());

  useEffect(() => {
    if (serverTimeMs == null || !Number.isFinite(serverTimeMs)) return;
    offsetRef.current = serverTimeMs - Date.now();
  }, [serverTimeMs]);

  useEffect(() => {
    const timer = window.setInterval(() => setClientNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return clientNow + offsetRef.current;
}
