import { useCallback, useEffect, useRef, useState } from "react";
import { isCloudHostedApp, localApi, localWatchdogApi } from "../config/api";

export type LocalServerStatus = "checking" | "online" | "offline" | "recovering";

const PING_INTERVAL_MS = 3_000;
const OFFLINE_AFTER_FAILURES = 2;
const AUTO_RESTART_AFTER_FAILURES = 3;

function isDirectorOnServerMachine(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

async function pingMainServer(): Promise<boolean> {
  try {
    const response = await fetch(localApi("/api/tracking/ping"), {
      signal: AbortSignal.timeout(4_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function requestWatchdogRestart(): Promise<boolean> {
  try {
    const response = await fetch(localWatchdogApi("/restart"), {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 409) return false;
    return response.ok;
  } catch {
    return false;
  }
}

export function useLocalServerStatus() {
  const [status, setStatus] = useState<LocalServerStatus>("checking");
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);
  const failureCountRef = useRef(0);
  const autoRestartAttemptedRef = useRef(false);
  const canRestartLocally = isDirectorOnServerMachine() && !isCloudHostedApp();

  const triggerRecovery = useCallback(async (manual: boolean) => {
    if (!canRestartLocally) {
      if (manual) {
        setRestartMessage("Sunucuyu salon bilgisayarından yeniden başlatın (start.bat veya tray).");
      }
      return false;
    }

    setRestartBusy(true);
    setRestartMessage(manual ? "Sunucu yeniden başlatılıyor…" : "PM2 otomatik kurtarma devrede…");
    setStatus("recovering");

    const started = await requestWatchdogRestart();
    if (!started && manual) {
      setRestartMessage("Otomatik başlatma başarısız. start.bat veya tray launcher kullanın.");
      setRestartBusy(false);
      setStatus("offline");
      return false;
    }

    return started;
  }, [canRestartLocally]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const online = await pingMainServer();
      if (cancelled) return;

      if (online) {
        failureCountRef.current = 0;
        autoRestartAttemptedRef.current = false;
        setRestartBusy(false);
        setRestartMessage(null);
        setStatus("online");
        return;
      }

      failureCountRef.current += 1;

      if (failureCountRef.current >= AUTO_RESTART_AFTER_FAILURES && !autoRestartAttemptedRef.current) {
        autoRestartAttemptedRef.current = true;
        await triggerRecovery(false);
        return;
      }

      if (failureCountRef.current >= OFFLINE_AFTER_FAILURES) {
        setStatus((current) => (current === "recovering" ? "recovering" : "offline"));
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [triggerRecovery]);

  const restartServer = useCallback(async () => {
    if (status === "online" || status === "checking") return;
    await triggerRecovery(true);
  }, [status, triggerRecovery]);

  return {
    status,
    restartBusy,
    restartMessage,
    canRestartLocally,
    restartServer,
    isOnline: status === "online",
    showRestartButton: status === "offline" && !restartBusy,
  };
}
