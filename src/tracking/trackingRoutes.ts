import { Router } from "express";
import os from "os";
import { ClockState, Player, PayoutStructure, Table, TournamentSettings } from "../types";
import { buildPlayerDisplayName } from "./playerSearch";
import { buildTrackingLiveState } from "./liveState";
import { isTrackingActivePlayer } from "./playerStatus";

type TrackingDataSource = () => {
  players: Player[];
  settings: TournamentSettings;
  tables: Table[];
  clock: ClockState;
  payouts?: PayoutStructure[];
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

  router.get("/players", (_req, res) => {
    const { players, settings, tables } = getData();
    const tableById = new Map(tables.map((table) => [table.id, table]));

    const trackingPlayers = players
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

    res.json({
      tournamentName: settings.name,
      players: trackingPlayers,
    });
  });

  router.get("/live", (_req, res) => {
    const data = getData();
    res.json(buildTrackingLiveState({
      settings: data.settings,
      clock: data.clock,
      players: data.players,
      payouts: data.payouts,
    }));
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
