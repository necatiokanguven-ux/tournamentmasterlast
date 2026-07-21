import type { TournamentDatabase } from "../tournamentDatabase";
import { countActiveDealerDevicesByType } from "../../dealer/dealerRuntimeStore";
import { getHttpMetricsSnapshot } from "./httpMetrics";
import { getHostMetricsSnapshot } from "./hostMetrics";
import { countActiveQrDevices } from "./qrDeviceTracker";
import { getRuntimeTuningState, isAutoProtectionEnabled } from "./runtimeTuning";
import {
  getLastHealthEvaluation,
  getNavStatusLabel,
  getSystemHealthStatus,
  setAutoProtectionContext,
  tickAutoProtection,
} from "./throttleEngine";
import { getTuningAuditLog } from "./tuningAuditLog";
import { getVenueDeviceMode, type VenueDeviceMode } from "./venueDeviceMode";

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
  evaluation: {
    inGracePeriod: boolean;
    graceRemainingMs: number;
    hasVenueLoad: boolean;
    p95Reliable: boolean;
    triggers: string[];
  };
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
  venueDeviceMode: VenueDeviceMode;
};

function countConnectedDevices(
  devices: SystemHealthSnapshot["devices"],
): number {
  return devices.dealerTablets + devices.dealerPhones + devices.floorPhones + devices.qrPhones;
}

function buildRecommendations(
  status: ReturnType<typeof getSystemHealthStatus>,
  devices: SystemHealthSnapshot["devices"],
  evaluation: SystemHealthSnapshot["evaluation"],
  host: ReturnType<typeof getHostMetricsSnapshot>,
): string[] {
  const tips: string[] = [];

  if (host.ramPercent >= 95) {
    tips.push(
      `Host memory is ${host.ramPercent}% — informational only on Windows venue PCs. Close unused browser tabs if the PC feels slow.`,
    );
  }

  if (evaluation.inGracePeriod) {
    tips.push("Startup calibration in progress — auto protection stays idle while the server settles.");
    return tips;
  }

  if (!evaluation.p95Reliable) {
    tips.push("Latency stats need more traffic before p95 is used for protection decisions.");
  }

  if (status === "green") {
    tips.push("System is stable. Current device load is within normal range.");
    return tips;
  }

  if (status === "yellow") {
    tips.push("Load is elevated but the tournament can continue. Auto Protection may adjust refresh if needed.");
    if (devices.dealerTablets >= 20) {
      tips.push("Dealer tablet count is high — avoid adding more tablets.");
    }
    return tips;
  }

  if (status === "orange") {
    tips.push("High sustained load — avoid adding new devices.");
    tips.push("Keep Dealer Control open. Tournament can continue.");
    return tips;
  }

  tips.push("Critical sustained load — do not connect more phones or tablets.");
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

  const tableTablets = countActiveDealerDevicesByType("tablet");
  const tablePhones = countActiveDealerDevicesByType("phone");
  const qrPhones = countActiveQrDevices();

  const devices = {
    openTables: db.tables.length,
    dealerTablets: tableTablets,
    dealerPhones: Math.max(options.wsChannels.dealerPhone, tablePhones),
    floorPhones: Math.max(options.wsChannels.floor, 0),
    qrPhones,
    wsClients: options.wsClients,
  };

  const connectedDevices = countConnectedDevices(devices);
  setAutoProtectionContext({ uptimeMs: options.uptimeMs, connectedDevices });

  const tuning = getRuntimeTuningState();
  const status = getSystemHealthStatus();
  const evaluationState = getLastHealthEvaluation();
  const evaluation = {
    inGracePeriod: evaluationState?.inGracePeriod ?? false,
    graceRemainingMs: evaluationState?.graceRemainingMs ?? 0,
    hasVenueLoad: evaluationState?.hasVenueLoad ?? false,
    p95Reliable: evaluationState?.p95Reliable ?? traffic.p95Reliable,
    triggers: evaluationState?.triggers ?? [],
  };
  const nav = getNavStatusLabel(status, tuning.level, evaluationState);

  return {
    generatedAt: Date.now(),
    status,
    nav,
    uptimeMs: options.uptimeMs,
    persistence: options.persistence,
    evaluation,
    autoProtection: {
      enabled: isAutoProtectionEnabled(),
      level: tuning.level,
      values: tuning.values,
      normalValues: tuning.normalValues,
    },
    devices,
    host,
    traffic,
    recommendations: buildRecommendations(status, devices, evaluation, host),
    recentActions: getTuningAuditLog(20),
    venueDeviceMode: getVenueDeviceMode(),
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
): Pick<SystemHealthSnapshot, "generatedAt" | "status" | "nav" | "autoProtection" | "evaluation"> {
  const host = getHostMetricsSnapshot();
  const traffic = getHttpMetricsSnapshot();

  const tableTablets = countActiveDealerDevicesByType("tablet");
  const tablePhones = countActiveDealerDevicesByType("phone");
  const qrPhones = countActiveQrDevices();
  const connectedDevices =
    tableTablets
    + Math.max(options.wsChannels.dealerPhone, tablePhones)
    + Math.max(options.wsChannels.floor, 0)
    + qrPhones;

  setAutoProtectionContext({ uptimeMs: options.uptimeMs, connectedDevices });

  const tuning = getRuntimeTuningState();
  const status = getSystemHealthStatus();
  const evaluationState = getLastHealthEvaluation();

  return {
    generatedAt: Date.now(),
    status,
    nav: getNavStatusLabel(status, tuning.level, evaluationState),
    evaluation: {
      inGracePeriod: evaluationState?.inGracePeriod ?? false,
      graceRemainingMs: evaluationState?.graceRemainingMs ?? 0,
      hasVenueLoad: evaluationState?.hasVenueLoad ?? false,
      p95Reliable: evaluationState?.p95Reliable ?? traffic.p95Reliable,
      triggers: evaluationState?.triggers ?? [],
    },
    autoProtection: {
      enabled: isAutoProtectionEnabled(),
      level: tuning.level,
      values: tuning.values,
      normalValues: tuning.normalValues,
    },
  };
}
