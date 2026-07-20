import { Router } from "express";
import { buildTrackingLiveState } from "../tracking/liveState";
import type { DealerTimerModeSetting } from "../types";
import type { TournamentDatabase } from "../server/tournamentDatabase";
import { DEFAULT_DEALER_TIMER_MODE, findTableByNumber } from "../server/tournamentDatabase";
import { bustPlayerOnTable, createFloorCall } from "../server/tournamentOperations";
import { buildSeatSnapshot } from "../server/tableSnapshot";
import { buildLocalUrl } from "../server/localNetwork";
import {
  getCurrentTableDealSeconds,
  getDealRemainingSeconds,
  getDisplayDealerForTable,
} from "../dealerRotation/dealerTimeUtils";
import { dealerDisplayName } from "../server/dealerRotation/types";
import {
  applyDealerTimerAction,
  getDealerTimerSnapshot,
  heartbeatDealerDevice,
  registerDealerDevice,
} from "./dealerRuntimeStore";
import { broadcastDealerTimer } from "./dealerTimerWebSocket";
import type { DealerTimerAction } from "./dealerTimerTypes";
type DbAccessor = () => TournamentDatabase;
type DbSaver = (db: TournamentDatabase) => void;

function getDealerTimerMode(db: TournamentDatabase): DealerTimerModeSetting {
  return db.settings.dealerTimerMode ?? DEFAULT_DEALER_TIMER_MODE;
}

function validateTimerActionForMode(
  mode: DealerTimerModeSetting,
  action: DealerTimerAction,
): string | null {
  if (mode === "none") {
    return "TIMER_DISABLED";
  }
  if (mode === "call_time" && action === "start_player") {
    return "TIMER_MODE_CALL_ONLY";
  }
  if (mode === "player_time" && action === "start_call") {
    return "TIMER_MODE_PLAYER_ONLY";
  }
  return null;
}

function parseTableNumber(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
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

    const setupUrlTablet = buildLocalUrl(port, `/dealer/setup?table=${tableNumber}&device=tablet`);
    const setupUrlPhone = buildLocalUrl(port, `/dealer/setup?table=${tableNumber}&device=phone`);
    res.json({
      tableNumber,
      tableId: table.id,
      setupUrl: setupUrlTablet,
      setupUrlTablet,
      setupUrlPhone,
      dealerUrl: buildLocalUrl(port, `/dealer/${tableNumber}`),
    });
  });

  router.get("/table/:tableNumber/notifications", (req, res) => {
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

    const dealerIds = new Set(
      db.dealerRotation.staff
        .filter(
          s => s.tableId === table.id && (s.state === "on_table" || s.state === "incoming"),
        )
        .map(s => s.id),
    );

    const notifications = db.dealerRotation.notifications
      .filter(n => dealerIds.has(n.dealerId) && !n.readAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ notifications });
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

    const assignedDealer = db.dealerRotation.settings.enabled
      ? getDisplayDealerForTable(db.dealerRotation.staff, snapshot.table.id)
      : undefined;
    const dealerDealSeconds = assignedDealer
      ? getCurrentTableDealSeconds(assignedDealer, Date.now(), db.dealerRotation.settings)
      : 0;
    const dealerRotationRemainingSeconds = assignedDealer
      ? getDealRemainingSeconds(assignedDealer, Date.now())
      : null;

    res.json({
      version: db.meta.lastModified,
      tableNumber: snapshot.table.number,
      tableId: snapshot.table.id,
      tournamentName: db.settings.name,
      rotationEnabled: db.dealerRotation.settings.enabled,
      dealerId: assignedDealer?.id ?? null,
      dealerName: assignedDealer ? dealerDisplayName(assignedDealer) : null,
      dealerState: assignedDealer?.state ?? null,
      dealerDealSeconds,
      dealerRotationRemainingSeconds,
      dealerDealStartedAt: assignedDealer?.dealStartedAt ?? null,
      dealerDealEndAt: assignedDealer?.dealEndAt ?? null,
      rotationTDealMinutes: db.dealerRotation.settings.tDealMinutes,
      seats: snapshot.seats,
      timerSettings: {
        mode: getDealerTimerMode(db),
        callTimeSeconds: db.settings.dealerCallTimeSeconds ?? 30,
        playerTimeSeconds: db.settings.dealerPlayerTimeSeconds ?? 60,
      },
      dealerTimer: getDealerTimerSnapshot(tableNumber),
      connectedDevices: heartbeatDealerDevice(
        tableNumber,
        typeof req.query.deviceId === "string" ? req.query.deviceId : null,
      ).connectedDevices,
      clock: {
        timeRemaining: live.timeRemaining,
        isRunning: live.isRunning,
        currentLevelIndex: db.clock.currentLevelIndex,
        currentLevel: live.currentLevel,
        isBreak: live.isBreak,
        currentBlinds: live.currentBlinds,
        nextBlinds: live.nextBlinds,
        nextBreak: live.nextBreak,
        remainingPlayers: live.remainingPlayers,
        totalPlayers: live.totalPlayers,
        playersDisplay: live.playersDisplay,
        serverTime: live.serverTime,
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
      res.status(400).json(result);
      return;
    }

    saveDb(db);
    res.json({ success: true, call: result.call, version: db.meta.lastModified });
  });

  router.post("/table/:tableNumber/register", (req, res) => {
    const tableNumber = parseTableNumber(req.params.tableNumber);
    if (!tableNumber) {
      res.status(400).json({ error: "INVALID_TABLE_NUMBER" });
      return;
    }

    const db = getDb();
    if (!findTableByNumber(db, tableNumber)) {
      res.status(404).json({ error: "TABLE_NOT_FOUND" });
      return;
    }

    const deviceId = String(req.body?.deviceId ?? "").trim();
    const result = registerDealerDevice(tableNumber, deviceId);

    if (result.ok === false) {
      const status = result.error === "DEVICE_LIMIT" ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      connectedDevices: result.connectedDevices,
      dealerTimer: getDealerTimerSnapshot(tableNumber),
    });
  });

  router.post("/table/:tableNumber/timer", (req, res) => {
    const tableNumber = parseTableNumber(req.params.tableNumber);
    if (!tableNumber) {
      res.status(400).json({ error: "INVALID_TABLE_NUMBER" });
      return;
    }

    const db = getDb();
    if (!findTableByNumber(db, tableNumber)) {
      res.status(404).json({ error: "TABLE_NOT_FOUND" });
      return;
    }

    const deviceId = String(req.body?.deviceId ?? "").trim();
    const action = String(req.body?.action ?? "") as DealerTimerAction;
    const allowedActions: DealerTimerAction[] = [
      "start_call",
      "start_player",
      "pause",
      "resume",
      "reset",
    ];

    if (!allowedActions.includes(action)) {
      res.status(400).json({ error: "INVALID_ACTION" });
      return;
    }

    const timerMode = getDealerTimerMode(db);
    const modeError = validateTimerActionForMode(timerMode, action);
    if (modeError) {
      res.status(400).json({ error: modeError });
      return;
    }

    const result = applyDealerTimerAction(tableNumber, deviceId, action, {
      callTimeSeconds: db.settings.dealerCallTimeSeconds ?? 30,
      playerTimeSeconds: db.settings.dealerPlayerTimeSeconds ?? 60,
    });

    if (result.ok === false) {
      const status =
        result.error === "DEVICE_NOT_REGISTERED"
          ? 403
          : result.error === "TIMER_NOT_RUNNING" || result.error === "TIMER_NOT_PAUSED"
            ? 409
            : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    if (timerMode === "call_time") {
      broadcastDealerTimer(tableNumber, result.timer);
    }

    res.json({
      success: true,
      dealerTimer: result.timer,
    });
  });

  return router;
}
