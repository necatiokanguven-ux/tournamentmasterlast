import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isDirectorOnServerMachine, localApi } from "../config/api";

export interface UpdateCheckResult {
  supported: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  mandatory: boolean;
  notes: string[];
  downloadReady: boolean;
  snoozed: boolean;
  checkFailed?: boolean;
  expectedSha256?: string;
  state?: {
    phase?: string;
    downloadPercent?: number;
    error?: string;
    errorCode?: string;
  };
}

type UpdateUiPhase =
  | "idle"
  | "prompt"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export function useAppUpdate() {
  const enabled = isDirectorOnServerMachine();
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);
  const [uiPhase, setUiPhase] = useState<UpdateUiPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(localApi("/api/update/status"));
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      state?: {
        phase?: string;
        downloadPercent?: number;
        error?: string;
        errorCode?: string;
      };
    };
    const phase = payload.state?.phase;
    if (phase === "downloading" || phase === "verifying") {
      setUiPhase("downloading");
    } else if (phase === "downloaded") {
      setUiPhase("ready");
    } else if (phase === "applying" || phase === "awaiting_health") {
      setUiPhase("installing");
    } else if (phase === "failed") {
      setUiPhase("error");
      setMessage(payload.state?.error ?? "Update failed.");
    } else if (phase === "complete") {
      setUiPhase("idle");
    }
    setCheckResult(prev => (prev ? { ...prev, state: payload.state } : prev));
  }, []);

  const runCheck = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const response = await fetch(localApi("/api/update/check"));
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as UpdateCheckResult;
      setCheckResult(payload);

      if (payload.state?.phase === "failed") {
        setUiPhase("error");
        setMessage(payload.state.error ?? "A previous update attempt failed.");
        return;
      }

      if (payload.updateAvailable) {
        if (payload.downloadReady) {
          setUiPhase("ready");
        } else if (payload.state?.phase === "downloading" || payload.state?.phase === "verifying") {
          setUiPhase("downloading");
        } else {
          setUiPhase("prompt");
        }
      } else {
        setUiPhase("idle");
      }
    } catch {
      // fail open
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void runCheck();
    return () => clearPoll();
  }, [enabled, runCheck, clearPoll]);

  useEffect(() => {
    if (uiPhase !== "downloading") {
      clearPoll();
      return;
    }

    pollRef.current = window.setInterval(() => {
      void refreshStatus();
    }, 1000);

    return () => clearPoll();
  }, [uiPhase, refreshStatus, clearPoll]);

  const dismiss = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(localApi("/api/update/dismiss"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 24 }),
      });
      setUiPhase("idle");
      setCheckResult(prev => (prev ? { ...prev, updateAvailable: false, snoozed: true } : prev));
    } finally {
      setBusy(false);
    }
  }, []);

  const startDownload = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(localApi("/api/update/download"), { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Download could not be started.");
      }
      setUiPhase("downloading");
      pollRef.current = window.setInterval(() => {
        void refreshStatus();
      }, 1000);
    } catch (error) {
      setUiPhase("error");
      setMessage(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const applyUpdate = useCallback(async () => {
    setBusy(true);
    setMessage("The application will now close to install the update.");
    setUiPhase("installing");
    try {
      const response = await fetch(localApi("/api/update/apply"), { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Update could not be started.");
      }
    } catch (error) {
      setUiPhase("error");
      setMessage(error instanceof Error ? error.message : "Update failed.");
      setBusy(false);
    }
  }, []);

  const visible = useMemo(() => {
    if (!enabled || !checkResult?.supported) {
      return false;
    }
    if (checkResult.mandatory && checkResult.updateAvailable) {
      return true;
    }
    return uiPhase !== "idle";
  }, [enabled, checkResult, uiPhase]);

  return {
    enabled,
    visible,
    checkResult,
    uiPhase,
    busy,
    message,
    dismiss,
    startDownload,
    applyUpdate,
    refreshStatus,
    runCheck,
  };
}
