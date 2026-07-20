import type { TournamentDatabase } from "./tournamentDatabase";
import { isDealerInPhoneGrace } from "./dealerRotation/phoneGrace";
import { getMetricsSnapshot, getRedisStatusSync } from "./redis/metricsStore";
import { getSnapshotCacheStatus } from "./redis/snapshotCache";
import { isWsRpcWritesEnabled, getRegisteredWsRpcMethods } from "./websocket/wsRpcDispatcher";

export type AdminDashboardSnapshot = {
  generatedAt: number;
  uptimeMs: number;
  persistence: string;
  postgresConfigured: boolean;
  readReplicaConfigured: boolean;
  httpPort: number;
  shuttingDown: boolean;
  wsClients: number;
  tournament: {
    name: string;
    tableCount: number;
    playerCount: number;
    clockRunning: boolean;
    currentLevelIndex: number;
  };
  dealerRotation: {
    enabled: boolean;
    staffCount: number;
    activeDealers: number;
    phoneGraceCount: number;
    phoneGraceCountFromPg: number | null;
    zoneCount: number;
  };
  redis: ReturnType<typeof getRedisStatusSync>;
  snapshotCache: ReturnType<typeof getSnapshotCacheStatus>;
  metrics: ReturnType<typeof getMetricsSnapshot>;
  wsRpc: {
    writesEnabled: boolean;
    methods: string[];
  };
};

export function buildAdminDashboardSnapshot(
  db: TournamentDatabase,
  options: {
    uptimeMs: number;
    persistence: string;
    postgresConfigured: boolean;
    readReplicaConfigured: boolean;
    httpPort: number;
    shuttingDown: boolean;
    wsClients: number;
    phoneGraceCountFromPg?: number | null;
  },
): AdminDashboardSnapshot {
  const staff = db.dealerRotation.staff;
  const phoneGraceCount = staff.filter(member => isDealerInPhoneGrace(member)).length;
  const activeDealers = staff.filter(member => member.state === "on_table" || member.state === "incoming").length;

  return {
    generatedAt: Date.now(),
    uptimeMs: options.uptimeMs,
    persistence: options.persistence,
    postgresConfigured: options.postgresConfigured,
    readReplicaConfigured: options.readReplicaConfigured,
    httpPort: options.httpPort,
    shuttingDown: options.shuttingDown,
    wsClients: options.wsClients,
    tournament: {
      name: db.settings.name ?? "Untitled",
      tableCount: db.tables.length,
      playerCount: db.players.length,
      clockRunning: db.clock.isRunning,
      currentLevelIndex: db.clock.currentLevelIndex,
    },
    dealerRotation: {
      enabled: db.dealerRotation.settings.enabled,
      staffCount: staff.length,
      activeDealers,
      phoneGraceCount,
      phoneGraceCountFromPg: options.phoneGraceCountFromPg ?? null,
      zoneCount: db.settings.dealerZones?.length ?? 0,
    },
    redis: getRedisStatusSync(),
    snapshotCache: getSnapshotCacheStatus(),
    metrics: getMetricsSnapshot(),
    wsRpc: {
      writesEnabled: isWsRpcWritesEnabled(),
      methods: getRegisteredWsRpcMethods(),
    },
  };
}
