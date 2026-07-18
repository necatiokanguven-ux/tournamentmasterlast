import { Router } from "express";
import { buildTrackingLiveState } from "../tracking/liveState";
import type { TournamentDatabase } from "../server/tournamentDatabase";
import { findTableByNumber } from "../server/tournamentDatabase";
import { bustPlayerOnTable, createFloorCall } from "../server/tournamentOperations";
import { buildLocalUrl } from "../server/localNetwork";
import type { Player } from "../types";

type DbAccessor = () => TournamentDatabase;
type DbSaver = (db: TournamentDatabase) => void;

function parseTableNumber(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildSeatSnapshot(db: TournamentDatabase, tableNumber: number) {
  const table = findTableByNumber(db, tableNumber);
  if (!table) return null;

  const seats = table.seats.map((playerId, seatIndex) => {
    if (!playerId) {
      return {
        seatNumber: seatIndex + 1,
        seatIndex,
        playerId: null,
        firstName: null,
        lastName: null,
        displayName: null,
        country: null,
        status: null as Player["status"] | null,
        isOpen: true,
      };
    }

    const player = db.players.find((entry) => entry.id === playerId);
    if (!player) {
      return {
        seatNumber: seatIndex + 1,
        seatIndex,
        playerId: null,
        firstName: null,
        lastName: null,
        displayName: null,
        country: null,
        status: null,
        isOpen: true,
      };
    }

    return {
      seatNumber: seatIndex + 1,
      seatIndex,
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      displayName: `${player.firstName} ${player.lastName}`.trim(),
      country: player.country,
      status: player.status,
      isOpen: false,
    };
  });

  return { table, seats };
}

export function createDealerRouter(port: number, getDb: DbAccessor, saveDb: DbSaver) {
  const router = Router();

  router.get("/tables", (_req, res) => {
    const db = getDb();
    res.json({
      tables: db.tables.map((table) => ({
        id: table.id,
        number: table.number,
        occupants: table.seats.filter(Boolean).length,
      })),
    });
  });

  router.get("/table/:tableNumber/qr-url", (req, res) => {
    const tableNumber = parseTableNumber(req.params.tableNumber);
    if (!tableNumber) {
      res.status(400).json({ error: "INVALID_TABLE_NUMBER" });
      return;
    }
    const db = getDb();
    const table = findTableByNumber(db, tableNumber);

    if (!table) {
      res.status(404).json({ error: "TABLE_NOT_FOUND" });
      return;
    }

    const setupUrl = buildLocalUrl(port, `/dealer/setup?table=${tableNumber}`);
    res.json({
      tableNumber,
      tableId: table.id,
      setupUrl,
      dealerUrl: buildLocalUrl(port, `/dealer/${tableNumber}`),
    });
  });

  router.get("/table/:tableNumber", (req, res) => {
    const tableNumber = parseTableNumber(req.params.tableNumber);
    if (!tableNumber) {
      res.status(400).json({ error: "INVALID_TABLE_NUMBER" });
      return;
    }
    const db = getDb();
    const snapshot = buildSeatSnapshot(db, tableNumber);

    if (!snapshot) {
      res.status(404).json({ error: "TABLE_NOT_FOUND" });
      return;
    }

    const live = buildTrackingLiveState({
      settings: db.settings,
      clock: db.clock,
      players: db.players,
      payouts: db.payouts,
    });

    res.json({
      version: db.meta.lastModified,
      tableNumber: snapshot.table.number,
      tableId: snapshot.table.id,
      tournamentName: db.settings.name,
      seats: snapshot.seats,
      timerSettings: {
        callTimeSeconds: db.settings.dealerCallTimeSeconds ?? 30,
        playerTimeSeconds: db.settings.dealerPlayerTimeSeconds ?? 60,
      },
      clock: {
        timeRemaining: live.timeRemaining,
        isRunning: live.isRunning,
        currentLevel: live.currentLevel,
        isBreak: live.isBreak,
        currentBlinds: live.currentBlinds,
        nextBlinds: live.nextBlinds,
        nextBreak: live.nextBreak,
        remainingPlayers: live.remainingPlayers,
        totalPlayers: live.totalPlayers,
      },
    });
  });

  router.post("/table/:tableNumber/bust/:playerId", (req, res) => {
    const tableNumber = parseTableNumber(req.params.tableNumber);
    if (!tableNumber) {
      res.status(400).json({ error: "INVALID_TABLE_NUMBER" });
      return;
    }
    const { playerId } = req.params;
    const db = getDb();
    const result = bustPlayerOnTable(db, tableNumber, playerId);

    if (!result.ok) {
      res.status(400).json(result);
      return;
    }

    saveDb(db);
    res.json({ success: true, version: db.meta.lastModified });
  });

  router.post("/table/:tableNumber/floor-call", (req, res) => {
    const tableNumber = parseTableNumber(req.params.tableNumber);
    if (!tableNumber) {
      res.status(400).json({ error: "INVALID_TABLE_NUMBER" });
      return;
    }
    const db = getDb();
    const result = createFloorCall(db, tableNumber);

    if (result.ok === false) {
      res.status(result.error === "FLOOR_CALL_COOLDOWN" ? 429 : 400).json(result);
      return;
    }

    saveDb(db);
    res.json({ success: true, call: result.call, version: db.meta.lastModified });
  });

  return router;
}
