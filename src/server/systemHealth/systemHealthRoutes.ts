import type { Express, Request, Response } from "express";
import type { TournamentDatabase } from "../tournamentDatabase";
import type { TournamentSocketHub } from "../websocket/TournamentSocketHub";
import {
  buildSystemHealthSnapshot,
  buildSystemHealthSummary,
} from "./buildSystemHealthSnapshot";
import { getRuntimeTuningState } from "./runtimeTuning";

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
  return Math.max(wsCount, seenRecently);
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
    });
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
