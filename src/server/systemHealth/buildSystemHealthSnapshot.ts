import type { TournamentDatabase } from "../tournamentDatabase";
import { countActiveDealerTablets } from "../../dealer/dealerRuntimeStore";
import { getHttpMetricsSnapshot } from "./httpMetrics";
import { getHostMetricsSnapshot } from "./hostMetrics";
import { countActiveQrDevices } from "./qrDeviceTracker";
import { getRuntimeTuningState, isAutoProtectionEnabled } from "./runtimeTuning";
import { getNavStatusLabel, getSystemHealthStatus, tickAutoProtection } from "./throttleEngine";
import { getTuningAuditLog } from "./tuningAuditLog";

export type WsChannelCounts = {
  dealerPhone: number;
  floor: number;
  dealerControl: number;
  dealerTimer: number;
  total: number;
};

export type SystemHealthSnapshot = {
  generatedAt: number;
  status: ReturnType<typeof getSystemHealthStatus>;
  nav: ReturnType<typeof getNavStatusLabel>;
  uptimeMs: number;
  persistence: string;
  autoProtection: {
    enabled: boolean;
    level: number;
    values: ReturnType<typeof getRuntimeTuningState>["values"];
    normalValues: ReturnType<typeof getRuntimeTuningState>["normalValues"];
  };
  devices: {
    openTables: number;
    dealerTablets: number;
    dealerPhones: number;
    floorPhones: number;
    qrPhones: number;
    wsClients: number;
  };
  host: ReturnType<typeof getHostMetricsSnapshot>;
  traffic: ReturnType<typeof getHttpMetricsSnapshot>;
  recommendations: string[];
  recentActions: ReturnType<typeof getTuningAuditLog>;
};

function buildRecommendations(
  status: ReturnType<typeof getSystemHealthStatus>,
  devices: SystemHealthSnapshot["devices"],
  traffic: ReturnType<typeof getHttpMetricsSnapshot>,
  host: ReturnType<typeof getHostMetricsSnapshot>,
): string[] {
  const tips: string[] = [];

  if (host.ramPercent >= 95) {
    tips.push(
      `System RAM is ${host.ramPercent}% — informational only. Close unused browser tabs if the PC feels slow.`,
    );
  }

  if (status === "green") {
    tips.push("System is stable. Current device load is within safe range.");
    return tips;
  }

  if (status === "yellow") {
    tips.push("Load is rising. Auto Protection may slow device refresh if needed.");
    if (devices.dealerTablets >= 20) {
      tips.push("Dealer tablet count is high — avoid adding more tablets.");
    }
    return tips;
  }

  if (status === "orange") {
    tips.push("Auto Protection is active — do not add new devices.");
    tips.push("Keep Dealer Control open. Tournament can continue.");
    if (traffic.channels.find(c => c.channel === "dealerTablet")?.reqPerSec ?? 0 > 10) {
      tips.push("Most load is from dealer tablets.");
    }
    return tips;
  }

  tips.push("Critical load — do not connect more phones or tablets.");
  tips.push("Use Backup if problems persist.");
  return tips;
}

export function buildSystemHealthSnapshot(
  db: TournamentDatabase,
  options: {
    uptimeMs: number;
    persistence: string;
    wsClients: number;
    wsChannels: WsChannelCounts;
    staffCount: number;
  },
): SystemHealthSnapshot {
  const host = getHostMetricsSnapshot();
  const traffic = getHttpMetricsSnapshot();
  tickAutoProtection(host, traffic);

  const tuning = getRuntimeTuningState();
  const status = getSystemHealthStatus();
  const nav = getNavStatusLabel(status, tuning.level > 0, tuning.level);

  const dealerTablets = countActiveDealerTablets();
  const qrPhones = countActiveQrDevices();

  const devices = {
    openTables: db.tables.length,
    dealerTablets,
    dealerPhones: Math.max(options.wsChannels.dealerPhone, 0),
    floorPhones: Math.max(options.wsChannels.floor, 0),
    qrPhones,
    wsClients: options.wsClients,
  };

  return {
    generatedAt: Date.now(),
    status,
    nav,
    uptimeMs: options.uptimeMs,
    persistence: options.persistence,
    autoProtection: {
      enabled: isAutoProtectionEnabled(),
      level: tuning.level,
      values: tuning.values,
      normalValues: tuning.normalValues,
    },
    devices,
    host,
    traffic,
    recommendations: buildRecommendations(status, devices, traffic, host),
    recentActions: getTuningAuditLog(20),
  };
}

export function buildSystemHealthSummary(
  db: TournamentDatabase,
  options: {
    uptimeMs: number;
    persistence: string;
    wsClients: number;
    wsChannels: WsChannelCounts;
  },
): Pick<SystemHealthSnapshot, "generatedAt" | "status" | "nav" | "autoProtection"> {
  const host = getHostMetricsSnapshot();
  const traffic = getHttpMetricsSnapshot();
  tickAutoProtection(host, traffic);
  const tuning = getRuntimeTuningState();
  const status = getSystemHealthStatus();
  return {
    generatedAt: Date.now(),
    status,
    nav: getNavStatusLabel(status, isAutoProtectionEnabled() && tuning.level > 0, tuning.level),
    autoProtection: {
      enabled: isAutoProtectionEnabled(),
      level: tuning.level,
      values: tuning.values,
      normalValues: tuning.normalValues,
    },
  };
}
