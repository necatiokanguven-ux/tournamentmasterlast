import { Router, type Request } from "express";
import os from "os";
import type { TournamentDatabase } from "../tournamentDatabase";
import { buildLocalUrl } from "../localNetwork";
import { DealerQueueManager } from "./DealerQueueManager";
import { isRotationDealer } from "../../dealerRotation/staffRoles";
import { activeTablesFromDb, RotationTriggerService } from "./RotationTriggerService";
import { dealerDisplayName, type DealerRotationData, type DealerRotationSettings } from "./types";
import {
  getSessionBreakSeconds,
  getSessionDealSeconds,
} from "../../dealerRotation/dealerTimeUtils";
import type { CoverageActionResult } from "./types";
import {
  beginPhoneGrace,
  isDealerInPhoneGrace,
  rehydratePhoneSession,
  startPhoneSession,
} from "./phoneGrace";
import { buildDealerPhoneChannelPayload } from "../websocket/dealerPhoneChannel";
import {
  getDealerZones,
  isDealerZonesEnabled,
  resolveZoneFromQuery,
} from "./dealerZoneUtils";
import { buildDealerControlStatePayload } from "../websocket/dealerControlChannel";
import {
  assertZoneVersion,
  bumpZoneVersion,
  getZoneVersion,
  ZoneVersionConflictError,
} from "./zoneLock";
import { acquireZoneMutationLock } from "../redis/distributedLock";

type DbAccessor = () => TournamentDatabase;
type DbSaver = (db: TournamentDatabase) => void;

function parseZoneVersion(req: Request): number | undefined {
  const fromBody = Number(req.body?.zoneVersion);
  if (Number.isFinite(fromBody)) return fromBody;
  const fromQuery = Number(req.query.zoneVersion);
  if (Number.isFinite(fromQuery)) return fromQuery;
  return undefined;
}

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

function withManager(db: TournamentDatabase, fn: (manager: DealerQueueManager) => void): DealerRotationData {
  const manager = new DealerQueueManager(db.dealerRotation);
  if (isDealerZonesEnabled()) {
    manager.configureZones(true, getDealerZones(db.settings));
  }
  fn(manager);
  manager.commitNotifications();
  return manager.export();
}

function runCoverageAction(
  db: TournamentDatabase,
  saveDbFn: DbSaver,
  fn: (manager: DealerQueueManager, activeTables: ReturnType<typeof activeTablesFromDb>) => CoverageActionResult,
): CoverageActionResult {
  const activeTables = activeTablesFromDb(db.tables);
  let result: CoverageActionResult = { ok: true };
  db.dealerRotation = withManager(db, manager => {
    result = fn(manager, activeTables);
    manager.refreshCoverageAlerts(activeTables);
  });
  saveDbFn(db);
  return result;
}

export function createDealerControlRouter(
  port: number,
  getDb: DbAccessor,
  saveDb: DbSaver,
  hooks?: {
    onDealerPhoneUpdated?: (dealerId: string) => void;
    onDealerControlUpdated?: () => void;
  },
) {
  const router = Router();
  let activeMutationRequest: Request | undefined;

  const persistDb: DbSaver = (db) => {
    if (activeMutationRequest) {
      bumpZoneVersion(db, resolveZoneFromQuery(activeMutationRequest.query.zone));
    }
    saveDb(db);
  };

  router.use((req, res, next) => {
    if (!["POST", "PUT", "DELETE"].includes(req.method)) {
      next();
      return;
    }

    void (async () => {
      const zoneId = resolveZoneFromQuery(req.query.zone);
      const lock = await acquireZoneMutationLock(zoneId);
      if (!lock.acquired) {
        res.status(423).json({
          error: "ZONE_LOCK_BUSY",
          zoneId,
        });
        return;
      }

      activeMutationRequest = req;
      res.on("finish", () => {
        lock.release();
        activeMutationRequest = undefined;
      });

      try {
        assertZoneVersion(getDb(), zoneId, parseZoneVersion(req));
      } catch (error) {
        activeMutationRequest = undefined;
        lock.release();
        if (error instanceof ZoneVersionConflictError) {
          res.status(409).json({
            error: error.code,
            zoneId: error.zoneId,
            currentVersion: error.expected,
            receivedVersion: error.received,
          });
          return;
        }
        next(error);
        return;
      }

      next();
    })().catch(next);
  });

  const localAddresses = getLocalNetworkAddresses();
  const primaryAddress = localAddresses[0] ?? "localhost";
  const checkInUrl = `http://${primaryAddress}:${port}/dealer/checkin`;

  const triggerService = new RotationTriggerService(() => {
    const db = getDb();
    return {
      dealerRotation: db.dealerRotation,
      tables: activeTablesFromDb(db.tables),
      settings: db.settings,
      clock: db.clock,
    };
  });

  router.get("/health", (_req, res) => {
    const db = getDb();
    res.json({
      status: "ok",
      service: "dealer-control",
      checkInUrl,
      localAddresses,
      enabled: db.dealerRotation.settings.enabled,
      staffCount: db.dealerRotation.staff.filter(s => s.active).length,
      tableCount: db.tables.length,
    });
  });

  router.get("/state", (req, res) => {
    const db = getDb();
    const zoneId = resolveZoneFromQuery(req.query.zone);
    const payload = buildDealerControlStatePayload(db, zoneId);
    res.json({
      ...payload,
      checkInUrl,
      localAddresses,
      zonesEnabled: isDealerZonesEnabled(),
      dealerZones: getDealerZones(db.settings),
    });
  });

  router.put("/settings", (req, res) => {
    const db = getDb();
    const body = req.body ?? {};
    const patch: Partial<DealerRotationSettings> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (Number.isFinite(Number(body.tDealMinutes))) patch.tDealMinutes = Number(body.tDealMinutes);
    if (Number.isFinite(Number(body.tBreakMinutes))) patch.tBreakMinutes = Number(body.tBreakMinutes);
    if (typeof body.autoAssign === "boolean") patch.autoAssign = body.autoAssign;
    if (typeof body.handoffFrozen === "boolean") patch.handoffFrozen = body.handoffFrozen;
    if (typeof body.workHourAwareAssign === "boolean") patch.workHourAwareAssign = body.workHourAwareAssign;
    if (typeof body.level1FairOrder === "boolean") patch.level1FairOrder = body.level1FairOrder;

    db.dealerRotation = withManager(db, manager => {
      manager.updateSettings(patch);
    });
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/alerts/dismiss", (req, res) => {
    const fingerprint = String(req.body?.fingerprint ?? "").trim();
    if (!fingerprint) {
      res.status(400).json({ error: "FINGERPRINT_REQUIRED" });
      return;
    }

    const db = getDb();
    const activeTables = activeTablesFromDb(db.tables);
    db.dealerRotation = withManager(db, manager => {
      manager.dismissOperatorAlert(fingerprint);
      manager.refreshCoverageAlerts(activeTables, new Date());
    });
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/staff", (req, res) => {
    const db = getDb();
    const body = req.body ?? {};
    const id = typeof body.id === "string" ? body.id : `dealer-${Date.now()}`;
    const rolePreset = String(body.rolePreset ?? "dealer");
    const customRole = String(body.customRole ?? "").trim();
    let role = String(body.role ?? rolePreset).trim() || "dealer";
    if (rolePreset === "custom") {
      if (!customRole) {
        res.status(400).json({ error: "CUSTOM_ROLE_REQUIRED" });
        return;
      }
      role = customRole;
    } else if (rolePreset !== "dealer") {
      role = rolePreset;
    }

    db.dealerRotation = withManager(db, manager => {
      if (rolePreset === "custom" && customRole) {
        manager.registerCustomStaffRole(customRole);
      }
      manager.upsertStaff({
        id,
        firstName: String(body.firstName ?? "").trim(),
        lastName: String(body.lastName ?? "").trim(),
        phone: String(body.phone ?? "").trim(),
        maxWorkMinutes: Number.isFinite(Number(body.maxWorkMinutes)) ? Number(body.maxWorkMinutes) : 480,
        acceptsOvertime: Boolean(body.acceptsOvertime),
        active: body.active !== false,
        role,
        zoneId: typeof body.zoneId === "string" ? body.zoneId.trim() || null : null,
      });
    });
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/staff/:dealerId/shift", (req, res) => {
    const db = getDb();
    const active = Boolean(req.body?.active);
    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.setStaffShift(req.params.dealerId, active);
    });
    if (!ok) {
      res.status(400).json({ error: "SHIFT_TOGGLE_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/staff/:dealerId/zone", (req, res) => {
    const db = getDb();
    const dealer = db.dealerRotation.staff.find(entry => entry.id === req.params.dealerId);
    if (!dealer) {
      res.status(404).json({ error: "DEALER_NOT_FOUND" });
      return;
    }

    const zoneId = typeof req.body?.zoneId === "string" ? req.body.zoneId.trim() || null : null;
    if (zoneId && isDealerZonesEnabled()) {
      const zones = getDealerZones(db.settings);
      if (!zones.some(zone => zone.id === zoneId)) {
        res.status(400).json({ error: "INVALID_ZONE" });
        return;
      }
    }

    dealer.zoneId = zoneId;
    persistDb(db);
    hooks?.onDealerControlUpdated?.();
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.delete("/staff/:dealerId", (req, res) => {
    const db = getDb();
    const result = runCoverageAction(db, persistDb, (manager, activeTables) =>
      manager.removeStaff(req.params.dealerId, activeTables),
    );
    if (!result.ok) {
      res.status(409).json({ error: result.error, rotation: db.dealerRotation });
      return;
    }
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/initialize", (_req, res) => {
    const db = getDb();
    const tables = activeTablesFromDb(db.tables);
    db.dealerRotation = withManager(db, manager => {
      manager.initializeLevelOne(tables);
    });
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/assign", (req, res) => {
    const db = getDb();
    const { dealerId, tableId } = req.body ?? {};
    const table = db.tables.find(t => t.id === tableId);
    if (!table || !dealerId) {
      res.status(400).json({ error: "INVALID_ASSIGNMENT" });
      return;
    }

    db.dealerRotation = withManager(db, manager => {
      manager.manualAssign(dealerId, { id: table.id, number: table.number });
    });
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/move-to-waiting/:dealerId", (req, res) => {
    const db = getDb();
    const dealerId = req.params.dealerId;
    if (!db.dealerRotation.staff.some(s => s.id === dealerId)) {
      res.status(404).json({ error: "DEALER_NOT_FOUND" });
      return;
    }

    const result = runCoverageAction(db, persistDb, (manager, activeTables) =>
      manager.moveToWaitingById(dealerId, activeTables, new Date(), "Operator moved to waiting"),
    );
    if (!result.ok) {
      res.status(409).json({ error: result.error, rotation: db.dealerRotation });
      return;
    }
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/send-to-break/:dealerId", (req, res) => {
    const db = getDb();
    const result = runCoverageAction(db, persistDb, (manager, activeTables) =>
      manager.sendToBreak(req.params.dealerId, activeTables),
    );
    if (!result.ok) {
      res.status(409).json({ error: result.error, rotation: db.dealerRotation });
      return;
    }
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/send-to-pool/:dealerId", (req, res) => {
    const db = getDb();
    const result = runCoverageAction(db, persistDb, (manager, activeTables) =>
      manager.sendToPool(req.params.dealerId, activeTables),
    );
    if (!result.ok) {
      res.status(409).json({ error: result.error, rotation: db.dealerRotation });
      return;
    }
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/tick", (_req, res) => {
    const db = getDb();
    db.dealerRotation = triggerService.onTournamentClockTick();
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.get("/work-log", (_req, res) => {
    const db = getDb();
    res.json({ workLog: db.dealerRotation.workLog });
  });

  router.get("/staff/active", (_req, res) => {
    const db = getDb();
    res.json({
      staff: db.dealerRotation.staff
        .filter(s => s.active)
        .map(s => ({
          id: s.id,
          displayName: dealerDisplayName(s),
          firstName: s.firstName,
          lastName: s.lastName,
          role: s.role,
          state: s.state,
          tableNumber: s.tableNumber,
        })),
    });
  });

  router.post("/checkin", (req, res) => {
    const db = getDb();
    const dealerId = String(req.body?.dealerId ?? "");
    if (!dealerId) {
      res.status(400).json({ error: "DEALER_ID_REQUIRED" });
      return;
    }

    let result = { tableNumber: null as number | null, message: "" };
    db.dealerRotation = withManager(db, manager => {
      result = manager.checkIn(dealerId, activeTablesFromDb(db.tables));
    });
    persistDb(db);
    res.json({ success: true, ...result, rotation: db.dealerRotation });
  });

  router.post("/ack-assignment", (req, res) => {
    const db = getDb();
    const dealerId = String(req.body?.dealerId ?? "");
    if (!dealerId) {
      res.status(400).json({ error: "DEALER_ID_REQUIRED" });
      return;
    }

    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.acknowledgeAssignment(dealerId);
    });
    if (!ok) {
      res.status(400).json({ error: "ACK_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/ack-release", (req, res) => {
    const db = getDb();
    const dealerId = String(req.body?.dealerId ?? "");
    if (!dealerId) {
      res.status(400).json({ error: "DEALER_ID_REQUIRED" });
      return;
    }

    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.acknowledgeRelease(dealerId);
    });
    if (!ok) {
      res.status(400).json({ error: "ACK_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/ack-duty", (req, res) => {
    const db = getDb();
    const dealerId = String(req.body?.dealerId ?? "");
    if (!dealerId) {
      res.status(400).json({ error: "DEALER_ID_REQUIRED" });
      return;
    }

    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.acknowledgeDuty(dealerId);
    });
    if (!ok) {
      res.status(400).json({ error: "ACK_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/accept-table-duty", (req, res) => {
    const db = getDb();
    const dealerId = String(req.body?.dealerId ?? "");
    const tableId = String(req.body?.tableId ?? "");
    if (!dealerId || !tableId) {
      res.status(400).json({ error: "DEALER_ID_AND_TABLE_REQUIRED" });
      return;
    }

    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.acceptTableAssignment(dealerId, tableId);
    });
    if (!ok) {
      res.status(400).json({ error: "ACCEPT_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/emergency-call/:dealerId", (req, res) => {
    const db = getDb();
    const dealerId = req.params.dealerId;
    if (!db.dealerRotation.staff.some(s => s.id === dealerId)) {
      res.status(404).json({ error: "DEALER_NOT_FOUND" });
      return;
    }

    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.emergencyCall(dealerId);
    });
    if (!ok) {
      res.status(400).json({ error: "EMERGENCY_CALL_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/ack-emergency", (req, res) => {
    const db = getDb();
    const dealerId = String(req.body?.dealerId ?? "");
    if (!dealerId) {
      res.status(400).json({ error: "DEALER_ID_REQUIRED" });
      return;
    }

    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.acknowledgeEmergencyCall(dealerId);
    });
    if (!ok) {
      res.status(400).json({ error: "ACK_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.post("/confirm-arrival", (req, res) => {
    const db = getDb();
    const dealerId = String(req.body?.dealerId ?? "");
    const tableId = String(req.body?.tableId ?? "");
    if (!dealerId || !tableId) {
      res.status(400).json({ error: "INVALID_BODY" });
      return;
    }

    let ok = false;
    db.dealerRotation = withManager(db, manager => {
      ok = manager.confirmArrival(dealerId, tableId);
    });
    if (!ok) {
      res.status(400).json({ error: "CONFIRM_FAILED" });
      return;
    }
    persistDb(db);
    res.json({ success: true, rotation: db.dealerRotation });
  });

  router.get("/notifications/:dealerId", (req, res) => {
    const db = getDb();
    const dealerId = req.params.dealerId;
    const unread = db.dealerRotation.notifications
      .filter(n => n.dealerId === dealerId && !n.readAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ notifications: unread });
  });

  router.post("/notifications/:notificationId/read", (req, res) => {
    const db = getDb();
    const note = db.dealerRotation.notifications.find(n => n.id === req.params.notificationId);
    if (note) {
      note.readAt = new Date().toISOString();
      persistDb(db);
    }
    res.json({ success: true });
  });

  router.get("/qr-url", (_req, res) => {
    res.json({
      checkInUrl,
      setupUrl: buildLocalUrl(port, "/dealer/checkin"),
    });
  });

  router.post("/phone/session/start", (req, res) => {
    const dealerId = String(req.body?.dealerId ?? "").trim();
    const deviceId = String(req.body?.deviceId ?? "").trim();
    if (!dealerId || !deviceId) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }

    const db = getDb();
    const dealer = db.dealerRotation.staff.find(entry => entry.id === dealerId);
    if (!dealer) {
      res.status(404).json({ error: "DEALER_NOT_FOUND" });
      return;
    }

    const sessionToken = startPhoneSession(dealer, deviceId);
    persistDb(db);
    hooks?.onDealerPhoneUpdated?.(dealerId);

    const snapshot = buildDealerPhoneChannelPayload(getDb(), dealerId);
    res.json({ success: true, sessionToken, snapshot });
  });

  router.post("/phone/rehydrate", (req, res) => {
    const dealerId = String(req.body?.dealerId ?? "").trim();
    const sessionToken = String(req.body?.sessionToken ?? "").trim();
    const deviceId = String(req.body?.deviceId ?? "").trim();
    if (!dealerId || !sessionToken || !deviceId) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }

    const db = getDb();
    const dealer = db.dealerRotation.staff.find(entry => entry.id === dealerId);
    if (!dealer) {
      res.status(404).json({ error: "DEALER_NOT_FOUND" });
      return;
    }

    const result = rehydratePhoneSession(dealer, sessionToken, deviceId);
    if (!result.ok) {
      res.status(401).json(result);
      return;
    }

    persistDb(db);
    hooks?.onDealerPhoneUpdated?.(dealerId);
    hooks?.onDealerControlUpdated?.();

    const snapshot = buildDealerPhoneChannelPayload(getDb(), dealerId);
    res.json({ success: true, message: "Session rehydrated.", snapshot });
  });

  router.get("/phone/grace", (_req, res) => {
    const db = getDb();
    const now = Date.now();
    const graceDealers = db.dealerRotation.staff
      .filter(dealer => isDealerInPhoneGrace(dealer, now))
      .map(dealer => ({
        id: dealer.id,
        name: dealerDisplayName(dealer),
        tableNumber: dealer.tableNumber,
        phoneGraceUntil: dealer.phoneGraceUntil,
        stateBeforeDisconnect: dealer.stateBeforeDisconnect,
      }));

    res.json({ graceDealers, serverTime: now });
  });

  return { router, triggerService };
}

export {
  runDealerRotationTick,
  runDealerRotationOnClockSync,
  runDealerRotationOnTableClosed,
  syncDealerRotationAfterSave,
} from "./dealerRotationTick";
