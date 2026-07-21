import type { Express, Request, Response } from "express";
import type { TournamentDatabase } from "../tournamentDatabase";
import type { TournamentSocketHub } from "../websocket/TournamentSocketHub";
import { countActiveDealerDevicesByType } from "../../dealer/dealerRuntimeStore";
import { disconnectLegacyDealerTimerClients } from "../../dealer/dealerTimerWebSocket";
import {
  buildSystemHealthSnapshot,
  buildSystemHealthSummary,
} from "./buildSystemHealthSnapshot";
import { getRuntimeTuningState } from "./runtimeTuning";
import {
  applyVenueDeviceMode,
  getVenueDeviceMode,
  type VenueDeviceMode,
} from "./venueDeviceMode";

function isLocalRequest(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function countActiveDealerPhones(db: TournamentDatabase, wsCount: number): number {
  const now = Date.now();
  const seenRecently = db.dealerRotation.staff.filter((member) => {
    if (!member.phoneLastSeenAt) return false;
    const seenAt = new Date(member.phoneLastSeenAt).getTime();
    return Number.isFinite(seenAt) && now - seenAt <= 120_000;
  }).length;
  const registeredAtTable = countActiveDealerDevicesByType("phone");
  return Math.max(wsCount, seenRecently, registeredAtTable);
}

export function registerSystemHealthRoutes(
  app: Express,
  getDb: () => TournamentDatabase,
  getHub: () => TournamentSocketHub | null,
  options: {
    uptimeMs: () => number;
    persistence: () => string;
  },
): void {
  app.get("/api/runtime/tuning", (_req, res) => {
    const tuning = getRuntimeTuningState();
    res.json({
      generatedAt: Date.now(),
      enabled: tuning.enabled,
      level: tuning.level,
      values: tuning.values,
      venueDeviceMode: getVenueDeviceMode(),
    });
  });

  app.get("/api/admin/venue-device-mode", (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "LOCAL_ONLY" });
      return;
    }
    res.json({ mode: getVenueDeviceMode() });
  });

  app.put("/api/admin/venue-device-mode", (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "LOCAL_ONLY" });
      return;
    }
    const next = String(req.body?.mode ?? "") as VenueDeviceMode;
    if (next !== "on" && next !== "limited" && next !== "off") {
      res.status(400).json({ error: "INVALID_MODE" });
      return;
    }
    const hub = getHub();
    applyVenueDeviceMode(next, {
      hub,
      disconnectLegacyDealerTimers: () => disconnectLegacyDealerTimerClients("Venue mobile devices disabled by operator"),
    });
    res.json({ mode: getVenueDeviceMode() });
  });

  app.get("/api/admin/system-health/summary", (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "LOCAL_ONLY" });
      return;
    }
    const hub = getHub();
    const wsChannels = hub?.getChannelClientCounts() ?? {
      dealerPhone: 0,
      floor: 0,
      dealerControl: 0,
      dealerTimer: 0,
      total: 0,
    };
    res.json(
      buildSystemHealthSummary(getDb(), {
        uptimeMs: options.uptimeMs(),
        persistence: options.persistence(),
        wsClients: hub?.getClientCount() ?? 0,
        wsChannels,
      }),
    );
  });

  app.get("/api/admin/system-health", (req, res) => {
    if (!isLocalRequest(req)) {
      res.status(403).json({ error: "LOCAL_ONLY" });
      return;
    }
    const db = getDb();
    const hub = getHub();
    const wsChannels = hub?.getChannelClientCounts() ?? {
      dealerPhone: 0,
      floor: 0,
      dealerControl: 0,
      dealerTimer: 0,
      total: 0,
    };
    const snapshot = buildSystemHealthSnapshot(db, {
      uptimeMs: options.uptimeMs(),
      persistence: options.persistence(),
      wsClients: hub?.getClientCount() ?? 0,
      wsChannels: {
        ...wsChannels,
        dealerPhone: countActiveDealerPhones(db, wsChannels.dealerPhone),
      },
      staffCount: db.dealerRotation.staff.length,
    });
    res.json({
      ...snapshot,
      devices: {
        ...snapshot.devices,
        dealerPhones: countActiveDealerPhones(db, wsChannels.dealerPhone),
      },
    });
  });
}
