import express from "express";
import http from "http";
import path from "path";
import { loadProjectEnv } from "./src/server/loadEnv";
import { buildLocalAppUrl, resolveServerPort } from "./src/config/serverPort";

loadProjectEnv();
import { createTrackingRouter } from "./src/tracking/trackingRoutes";
import { registerLicenseRoutes, requireValidLicense } from "./src/license/serverRoutes";
import { applyLocalServerCors } from "./src/config/cors";
import { normalizeDatabase, type TournamentDatabase } from "./src/server/tournamentDatabase";
import { createDealerRouter } from "./src/dealer/dealerRoutes";
import { closeDealerTimerWebSockets } from "./src/dealer/dealerTimerWebSocket";
import { createFloorRouter, createSettingsRouter } from "./src/floor/floorRoutes";
import {
  createDealerControlRouter,
  runDealerRotationOnTableClosed,
  syncDealerRotationAfterSave,
} from "./src/server/dealerRotation/dealerControlRoutes";
import { runDealerControlBackgroundTick } from "./src/server/dealerRotation/dealerControlBackgroundTick";
import { attachWebSockets } from "./src/server/websocket/attachWebSockets";
import { buildClockChannelPayload } from "./src/server/websocket/clockChannel";
import type { TournamentSocketHub } from "./src/server/websocket/TournamentSocketHub";
import { beginPhoneGrace } from "./src/server/dealerRotation/phoneGrace";
import { createRepositoryAsync } from "./src/server/repository/createRepository";
import { isShuttingDown, registerGracefulShutdown } from "./src/server/gracefulShutdown";
import { resolveDatabaseReadUrl, resolveDatabaseUrl } from "./src/server/repository/databaseConfig";
import { PostgresRepository } from "./src/server/repository/postgres/PostgresRepository";
import { getMetricsSnapshot, getRedisStatus } from "./src/server/redis/metricsStore";
import {
  getCachedSnapshot,
  getSnapshotCacheStatus,
  invalidateSnapshotCache,
} from "./src/server/redis/snapshotCache";
import { applyClockSyncToDatabase } from "./src/server/clockSync";
import { buildDatabaseFromTournamentBackup } from "./src/server/tournamentImport";
import {
  getRegisteredWsRpcMethods,
  isWsRpcWritesEnabled,
  registerWsRpc,
} from "./src/server/websocket/wsRpcDispatcher";
import { buildAdminDashboardSnapshot } from "./src/server/adminDashboard";
import { createSystemHealthMiddleware } from "./src/server/systemHealth/systemHealthMiddleware";
import { registerSystemHealthRoutes } from "./src/server/systemHealth/systemHealthRoutes";
import { startHostMetricsSampler } from "./src/server/systemHealth/hostMetrics";
import { startAutoProtectionEngine } from "./src/server/systemHealth/throttleEngine";
import { createIdScanRouter } from "./src/server/idScan/idScanRoutes";
import { buildLocalUrl, getLocalNetworkAddresses, getPrimaryLocalAddress } from "./src/server/localNetwork";
import { openDirectorBrowser } from "./src/server/openBrowser";

const app = express();
const PORT = resolveServerPort();

let repository: Awaited<ReturnType<typeof createRepositoryAsync>>;
let socketHub: TournamentSocketHub | null = null;

function getDb(): TournamentDatabase {
  return getCachedSnapshot(() => repository.get());
}

function notifyMetaChanged(): void {
  socketHub?.broadcastMeta(getDb().meta.lastModified);
}

function notifyClockChanged(): void {
  socketHub?.broadcastClock(buildClockChannelPayload(getDb().clock));
}

function notifyWsSideEffects(): void {
  notifyMetaChanged();
  socketHub?.broadcastFloorUpdates();
  socketHub?.broadcastDealerPhonesForStaff();
  socketHub?.broadcastDealerControlUpdates();
}

function setDb(next: TournamentDatabase): void {
  repository.save(next);
  invalidateSnapshotCache();
  notifyWsSideEffects();
}

function saveDatabaseClockOnly(next: TournamentDatabase): void {
  repository.saveClockOnly(next);
  invalidateSnapshotCache();
  notifyClockChanged();
}

function openBrowser(url: string) {
  openDirectorBrowser(url);
}

async function startServer(
  dealerControlRouter: ReturnType<typeof createDealerControlRouter>["router"],
  dealerRotationTrigger: ReturnType<typeof createDealerControlRouter>["triggerService"],
) {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(
      express.static(distPath, {
        setHeaders(res, filePath) {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
            return;
          }
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const appUrl = buildLocalAppUrl(PORT);
  const httpServer = http.createServer(app);
  socketHub = attachWebSockets(httpServer, getDb);
  socketHub.setDealerPhoneDisconnectHandler((dealerId) => {
    const db = repository.get();
    const dealer = db.dealerRotation.staff.find(entry => entry.id === dealerId);
    if (!dealer) return;
    beginPhoneGrace(dealer);
    repository.save(db);
    invalidateSnapshotCache();
    socketHub?.broadcastDealerPhone(dealerId);
    socketHub?.broadcastDealerControlUpdates();
  });

  let backgroundTickInterval: ReturnType<typeof setInterval> | null = null;

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server listening on ${appUrl}`);
    console.log(`Persistence backend: ${repository.backend}`);
    console.log(`WebSocket hub: ${appUrl.replace(/^http/, "ws")}/ws/tournament`);
    console.log(`QR Live Tracking (Phase 1): ${appUrl}/track`);
    console.log(`Dealer Check-In: ${appUrl}/dealer/checkin`);
    console.log(`Dealer Control API: ${appUrl}/api/dealer-control/state`);
    console.log(`Floor Mobile: ${appUrl}/floor?team=floor-1`);
    openBrowser(appUrl);

    const BACKGROUND_TICK_MS = 5_000;
    backgroundTickInterval = setInterval(() => {
      if (isShuttingDown()) return;
      const db = repository.get();
      if (runDealerControlBackgroundTick(db, dealerRotationTrigger)) {
        repository.save(db);
        invalidateSnapshotCache();
        notifyWsSideEffects();
      }
    }, BACKGROUND_TICK_MS);
  });

  registerGracefulShutdown({
    httpServer,
    repository,
    onShutdown: () => {
      if (backgroundTickInterval) {
        clearInterval(backgroundTickInterval);
      }
      socketHub?.close();
      closeDealerTimerWebSockets();
    },
  });

  return { httpServer };
}

async function bootstrap() {
  const dataDir = process.env.TM_DATA_DIR?.trim();
  const repositoryOptions = dataDir
    ? {
        dbFilePath: path.join(dataDir, "db.json"),
        logsDirPath: path.join(dataDir, "logs"),
      }
    : {};

  repository = await createRepositoryAsync(repositoryOptions);
  repository.registerExistingHistory(repository.get().history || []);

  const licenseGuard = requireValidLicense();

  const { router: dealerControlRouter, triggerService: dealerRotationTrigger } = createDealerControlRouter(
    PORT,
    getDb,
    setDb,
    {
      onDealerPhoneUpdated: (dealerId) => {
        socketHub?.broadcastDealerPhone(dealerId);
      },
      onDealerControlUpdated: () => {
        socketHub?.broadcastDealerControlUpdates();
      },
    },
  );

  registerWsRpc("clock.sync", (params) => {
    if (!isWsRpcWritesEnabled()) {
      return { ok: false, error: "WS_RPC_WRITES disabled (set WS_RPC_WRITES=true to enable)." };
    }

    const db = repository.get();
    applyClockSyncToDatabase(db, params ?? {}, (at) => dealerRotationTrigger.onTournamentClockTick(at));
    saveDatabaseClockOnly(db);

    return {
      ok: true,
      payload: {
        success: true,
        clock: db.clock,
      },
    };
  });

  app.use(express.json({ limit: "6mb" }));
  applyLocalServerCors(app);
  app.use(createSystemHealthMiddleware());

  startHostMetricsSampler();
  startAutoProtectionEngine();

  app.get("/api/data", licenseGuard, (_req, res) => {
    res.json(getDb());
  });

  app.get("/api/data/meta", licenseGuard, (_req, res) => {
    res.json({ lastModified: getDb().meta.lastModified });
  });

  app.put("/api/clock/sync", licenseGuard, (req, res) => {
    const body = req.body ?? {};
    const db = repository.get();
    applyClockSyncToDatabase(db, body, (at) => dealerRotationTrigger.onTournamentClockTick(at));
    saveDatabaseClockOnly(db);

    res.json({
      success: true,
      clock: db.clock,
    });
  });

  app.post("/api/save", licenseGuard, (req, res) => {
    const db = repository.get();
    const incomingClientModified = Number(req.body?.meta?.lastModified) || 0;
    const previousTableIds = new Set(db.tables.map(table => table.id));
    const incoming = normalizeDatabase({
      ...req.body,
      floorCalls: Array.isArray(req.body?.floorCalls) ? req.body.floorCalls : db.floorCalls,
      dealerRotation: db.dealerRotation,
    });

    if (db.meta.lastModified > incomingClientModified) {
      incoming.players = db.players;
      incoming.tables = db.tables;
      incoming.history = db.history;
      incoming.floorCalls = db.floorCalls;
      incoming.payouts = db.payouts;
      incoming.dealerRotation = db.dealerRotation;
    }

    for (const tableId of previousTableIds) {
      if (!incoming.tables.some(table => table.id === tableId)) {
        runDealerRotationOnTableClosed(incoming, tableId, dealerRotationTrigger);
      }
    }

    repository.save(incoming);
    syncDealerRotationAfterSave(repository.get(), dealerRotationTrigger);
    const saved = repository.get();
    if (saved.dealerRotation !== incoming.dealerRotation) {
      repository.save(saved);
    }
    invalidateSnapshotCache();
    notifyWsSideEffects();

    res.json({
      success: true,
      message: "Database saved successfully",
      lastModified: repository.get().meta.lastModified,
      data: repository.get(),
    });
  });

  app.post("/api/reset", licenseGuard, (_req, res) => {
    const previousDb = repository.get();
    const previousTableIds = new Set(previousDb.tables.map((table) => table.id));
    const resetDb = repository.reset();
    repository.registerExistingHistory(resetDb.history || []);

    for (const tableId of previousTableIds) {
      if (!resetDb.tables.some((table) => table.id === tableId)) {
        runDealerRotationOnTableClosed(resetDb, tableId, dealerRotationTrigger);
      }
    }

    syncDealerRotationAfterSave(resetDb, dealerRotationTrigger);
    repository.save(resetDb);

    invalidateSnapshotCache();
    notifyWsSideEffects();
    res.json({ success: true, data: repository.get(), message: "Database reset to factory defaults" });
  });

  app.post("/api/tournament/import", licenseGuard, (req, res) => {
    const db = repository.get();
    const previousTableIds = new Set(db.tables.map(table => table.id));
    const built = buildDatabaseFromTournamentBackup(req.body);

    if (built.ok === false) {
      res.status(400).json({ success: false, error: built.error });
      return;
    }

    const incoming = built.db;

    for (const tableId of previousTableIds) {
      if (!incoming.tables.some(table => table.id === tableId)) {
        runDealerRotationOnTableClosed(incoming, tableId, dealerRotationTrigger);
      }
    }

    repository.save(incoming);
    syncDealerRotationAfterSave(repository.get(), dealerRotationTrigger);
    const saved = repository.get();
    if (saved.dealerRotation !== incoming.dealerRotation) {
      repository.save(saved);
    }
    repository.registerExistingHistory(saved.history || []);
    invalidateSnapshotCache();
    notifyWsSideEffects();

    res.json({
      success: true,
      data: saved,
      message: "Tournament backup imported successfully",
    });
  });

  app.get("/api/activity-log", licenseGuard, (_req, res) => {
    res.type("text/plain").send(repository.getActivityLogContent());
  });

  app.get("/api/network/venue-display-url", (_req, res) => {
    const path = "/display";
    res.json({
      path,
      host: getPrimaryLocalAddress(),
      port: PORT,
      url: buildLocalUrl(PORT, path),
      addresses: getLocalNetworkAddresses(),
    });
  });

  app.get("/api/health", async (_req, res) => {
    const postgresConfigured = Boolean(resolveDatabaseUrl());
    const redis = await getRedisStatus();
    const metrics = getMetricsSnapshot();
    const snapshotCache = getSnapshotCacheStatus();
    res.json({
      ok: !isShuttingDown(),
      uptimeMs: Math.round(process.uptime() * 1000),
      persistence: repository.backend,
      postgresConfigured,
      readReplicaConfigured: Boolean(resolveDatabaseReadUrl()),
      redis,
      snapshotCache,
      wsRpc: {
        writesEnabled: isWsRpcWritesEnabled(),
        methods: getRegisteredWsRpcMethods(),
      },
      metrics,
      httpPort: PORT,
      wsClients: socketHub?.getClientCount() ?? 0,
      shuttingDown: isShuttingDown(),
    });
  });

  app.post("/api/admin/shutdown", (req, res) => {
    const remote = req.socket.remoteAddress ?? "";
    const local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    if (!local) {
      res.status(403).json({ error: "LOCAL_ONLY" });
      return;
    }

    res.json({ ok: true, message: "Shutting down..." });
    setTimeout(() => {
      process.kill(process.pid, "SIGTERM");
    }, 100).unref();
  });

  app.get("/api/admin/dashboard", async (req, res) => {
    const remote = req.socket.remoteAddress ?? "";
    const local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    if (!local) {
      res.status(403).json({ error: "LOCAL_ONLY" });
      return;
    }

    res.json(
      buildAdminDashboardSnapshot(getDb(), {
        uptimeMs: Math.round(process.uptime() * 1000),
        persistence: repository.backend,
        postgresConfigured: Boolean(resolveDatabaseUrl()),
        readReplicaConfigured: Boolean(resolveDatabaseReadUrl()),
        httpPort: PORT,
        shuttingDown: isShuttingDown(),
        wsClients: socketHub?.getClientCount() ?? 0,
        phoneGraceCountFromPg:
          repository instanceof PostgresRepository
            ? await repository.countDealersInGrace().catch(() => null)
            : null,
      }),
    );
  });

  app.use("/api/tracking", (req, res, next) => {
    if (req.path === "/ping") {
      next();
      return;
    }

    licenseGuard(req, res, next);
  }, createTrackingRouter(PORT, getDb));

  app.use("/api/dealer", licenseGuard, createDealerRouter(PORT, getDb, setDb));
  app.use("/api/dealer-control", licenseGuard, dealerControlRouter);
  app.use("/api/floor", licenseGuard, createFloorRouter(PORT, getDb, setDb));
  app.use("/api/settings", licenseGuard, createSettingsRouter(getDb, setDb));
  app.use("/api/players", licenseGuard, createIdScanRouter());

  registerLicenseRoutes(app);

  registerSystemHealthRoutes(app, getDb, () => socketHub, {
    uptimeMs: () => Math.round(process.uptime() * 1000),
    persistence: () => repository.backend,
  });

  await startServer(dealerControlRouter, dealerRotationTrigger);
}

bootstrap().catch(error => {
  console.error("Server bootstrap failed:", error);
  process.exit(1);
});
