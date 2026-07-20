import { Router } from "express";
import os from "os";
import { ClockState, Player, PayoutStructure, Table, TournamentSettings } from "../types";
import { buildPlayerDisplayName } from "./playerSearch";
import { buildTrackingLiveState } from "./liveState";
import { isTrackingActivePlayer } from "./playerStatus";
import { getCachedTrackingPlayersPayload } from "./trackingResponseCache";
import { buildTrackingPlayersEtag, sendTrackingJsonWithEtag } from "./trackingHttpUtils";

type TrackingDataSource = () => {
  players: Player[];
  settings: TournamentSettings;
  tables: Table[];
  clock: ClockState;
  payouts?: PayoutStructure[];
  meta?: { lastModified?: number };
};

function getLocalNetworkAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        addresses.push(config.address);
      }
    }
  }

  return addresses;
}

function hasSeatedActivePlayers(players: Player[]): boolean {
  return players.some(
    (player) => isTrackingActivePlayer(player.status) && player.tableId !== null,
  );
}

export function createTrackingRouter(port: number, getData: TrackingDataSource) {
  const router = Router();
  const localAddresses = getLocalNetworkAddresses();
  const primaryAddress = localAddresses[0] ?? "localhost";
  const trackingUrl = `http://${primaryAddress}:${port}/track`;

  router.get("/health", (_req, res) => {
    const { players } = getData();

    res.json({
      status: "ok",
      service: "qr-live-tracking",
      phase: 6,
      trackingReady: hasSeatedActivePlayers(players),
      serverTime: new Date().toISOString(),
      port,
      localAddresses,
      trackingUrl,
    });
  });

  router.get("/ping", (_req, res) => {
    res.json({
      pong: true,
      serverTime: new Date().toISOString(),
    });
  });

  router.get("/players", (req, res) => {
    const snapshot = getData();
    const metaVersion = snapshot.meta?.lastModified ?? 0;
    const etag = buildTrackingPlayersEtag(metaVersion);
    const payload = getCachedTrackingPlayersPayload(snapshot.meta, () => {
      const tableById = new Map(snapshot.tables.map((table) => [table.id, table]));

      const trackingPlayers = snapshot.players
        .map((player) => {
          const table = player.tableId ? tableById.get(player.tableId) : undefined;
          const seatNumber =
            player.seatIndex !== null && player.seatIndex !== undefined ? player.seatIndex + 1 : null;

          return {
            id: player.id,
            displayName: buildPlayerDisplayName(player.firstName, player.lastName),
            tableNumber: table?.number ?? null,
            seatNumber,
            status: player.status,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      return {
        tournamentName: snapshot.settings.name,
        players: trackingPlayers,
      };
    });

    sendTrackingJsonWithEtag(req, res, etag, payload);
  });

  router.get("/live", (_req, res) => {
    const snapshot = getData();
    const payload = buildTrackingLiveState({
      settings: snapshot.settings,
      clock: snapshot.clock,
      players: snapshot.players,
      payouts: snapshot.payouts,
    });

    res.setHeader("Cache-Control", "private, no-cache");
    res.json(payload);
  });

  router.get("/payouts", (_req, res) => {
    const data = getData();
    const liveState = buildTrackingLiveState({
      settings: data.settings,
      clock: data.clock,
      players: data.players,
      payouts: data.payouts,
    });

    res.json({
      prizePool: liveState.prizePool,
      currency: liveState.currency,
      payouts: liveState.payouts,
    });
  });

  router.get("/status", (_req, res) => {
    const data = getData();
    const seatedPlayers = data.players.filter(
      (player) => isTrackingActivePlayer(player.status) && player.tableId !== null,
    ).length;

    res.json({
      trackingReady: seatedPlayers > 0,
      seatedPlayers,
      tournamentName: data.settings.name,
      clockRunning: data.clock.isRunning,
      currentLevelIndex: data.clock.currentLevelIndex,
    });
  });

  return router;
}
