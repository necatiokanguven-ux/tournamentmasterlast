import { useCallback, useEffect, useState } from "react";
import { localApi } from "../config/api";

export type SystemHealthNavStatus = {
  primary: string;
  secondary?: string;
  tone: "green" | "yellow" | "orange" | "red";
  status: "green" | "yellow" | "orange" | "red";
  autoProtectionLevel: number;
};

const EMPTY: SystemHealthNavStatus = {
  primary: "Checking...",
  tone: "green",
  status: "green",
  autoProtectionLevel: 0,
};

export function useSystemHealthNavStatus(enabled: boolean): SystemHealthNavStatus {
  const [status, setStatus] = useState<SystemHealthNavStatus>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(localApi("/api/admin/system-health/summary"));
      if (!response.ok) return;
      const data = await response.json();
      setStatus({
        primary: data.nav?.primary ?? "System normal",
        secondary: data.nav?.secondary,
        tone: data.nav?.tone ?? "green",
        status: data.status ?? "green",
        autoProtectionLevel: data.autoProtection?.level ?? 0,
      });
    } catch {
      setStatus({
        primary: "Unavailable",
        secondary: "Local server only",
        tone: "yellow",
        status: "yellow",
        autoProtectionLevel: 0,
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return status;
}

export function toneClass(tone: SystemHealthNavStatus["tone"]): string {
  switch (tone) {
    case "green":
      return "text-emerald-400";
    case "yellow":
      return "text-amber-400";
    case "orange":
      return "text-orange-400";
    case "red":
      return "text-red-400";
    default:
      return "text-zinc-500";
  }
}

export function statusBadgeClass(status: SystemHealthNavStatus["status"]): string {
  switch (status) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-500";
    case "orange":
      return "bg-orange-500";
    case "red":
      return "bg-red-500 animate-pulse";
    default:
      return "bg-zinc-500";
  }
}

/** Silent visual alert — red status only; no sound. */
export function healthNavStatusClass(status: SystemHealthNavStatus["status"]): string {
  return status === "red" ? "animate-pulse" : "";
}
