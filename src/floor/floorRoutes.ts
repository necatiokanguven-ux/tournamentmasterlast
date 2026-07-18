import { Router } from "express";
import type { FloorTeam } from "../types";
import type { TournamentDatabase } from "../server/tournamentDatabase";
import {
  bumpDatabaseMeta,
  normalizeSettings,
  validateFloorTeams,
} from "../server/tournamentDatabase";
import {
  acknowledgeFloorCall,
  getActiveFloorCallsForTeam,
  resolveFloorCall,
} from "../server/tournamentOperations";
import { buildSeatSnapshot } from "../server/tableSnapshot";
import { buildLocalUrl } from "../server/localNetwork";

type DbAccessor = () => TournamentDatabase;
type DbSaver = (db: TournamentDatabase) => void;

export function createFloorRouter(port: number, getDb: DbAccessor, saveDb: DbSaver) {
  const router = Router();

  router.get("/teams", (_req, res) => {
    const db = getDb();
    res.json({
      teams: db.settings.floorTeams ?? [],
      tables: db.tables.map((table) => table.number),
    });
  });

  router.get("/teams/:teamId/qr-url", (req, res) => {
    const db = getDb();
    const team = (db.settings.floorTeams ?? []).find((entry) => entry.id === req.params.teamId);

    if (!team) {
      res.status(404).json({ error: "TEAM_NOT_FOUND" });
      return;
    }

    res.json({
      teamId: team.id,
      teamName: team.name,
      floorUrl: buildLocalUrl(port, `/floor?team=${encodeURIComponent(team.id)}`),
      tableNumbers: team.tableNumbers,
    });
  });

  router.get("/calls", (req, res) => {
    const teamId = String(req.query.teamId ?? "");
    if (!teamId) {
      res.status(400).json({ error: "TEAM_ID_REQUIRED" });
      return;
    }

    const db = getDb();
    const team = (db.settings.floorTeams ?? []).find((entry) => entry.id === teamId);
    if (!team) {
      res.status(404).json({ error: "TEAM_NOT_FOUND" });
      return;
    }

    res.json({
      version: db.meta.lastModified,
      teamId: team.id,
      teamName: team.name,
      tableNumbers: team.tableNumbers,
      calls: getActiveFloorCallsForTeam(db, teamId),
    });
  });

  router.get("/tables", (req, res) => {
    const teamId = String(req.query.teamId ?? "");
    if (!teamId) {
      res.status(400).json({ error: "TEAM_ID_REQUIRED" });
      return;
    }

    const db = getDb();
    const team = (db.settings.floorTeams ?? []).find((entry) => entry.id === teamId);
    if (!team) {
      res.status(404).json({ error: "TEAM_NOT_FOUND" });
      return;
    }

    const tables = team.tableNumbers
      .map((tableNumber) => {
        const snapshot = buildSeatSnapshot(db, tableNumber);
        if (!snapshot) return null;

        return {
          tableNumber: snapshot.table.number,
          tableId: snapshot.table.id,
          occupants: snapshot.seats.filter((seat) => !seat.isOpen).length,
          seats: snapshot.seats.map((seat) => ({
            seatNumber: seat.seatNumber,
            displayName: seat.displayName,
            isOpen: seat.isOpen,
            status: seat.status,
          })),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.tableNumber - b.tableNumber);

    res.json({
      version: db.meta.lastModified,
      teamId: team.id,
      teamName: team.name,
      tables,
    });
  });

  router.post("/calls/:callId/ack", (req, res) => {
    const teamId = String(req.body?.teamId ?? "");
    const acknowledgedBy = String(req.body?.acknowledgedBy ?? "Floor").trim() || "Floor";

    if (!teamId) {
      res.status(400).json({ error: "TEAM_ID_REQUIRED" });
      return;
    }

    const db = getDb();
    const result = acknowledgeFloorCall(db, req.params.callId, teamId, acknowledgedBy);

    if (result.ok === false) {
      res.status(result.error === "ALREADY_ACKNOWLEDGED" ? 409 : 400).json(result);
      return;
    }

    saveDb(db);
    res.json({ success: true, call: result.call, version: db.meta.lastModified });
  });

  router.post("/calls/:callId/resolve", (req, res) => {
    const teamId = String(req.body?.teamId ?? "");
    if (!teamId) {
      res.status(400).json({ error: "TEAM_ID_REQUIRED" });
      return;
    }

    const db = getDb();
    const result = resolveFloorCall(db, req.params.callId, teamId);

    if (!result.ok) {
      res.status(400).json(result);
      return;
    }

    saveDb(db);
    res.json({ success: true, call: result.call, version: db.meta.lastModified });
  });

  return router;
}

export function createSettingsRouter(getDb: DbAccessor, saveDb: DbSaver) {
  const router = Router();

  router.get("/floor-teams", (_req, res) => {
    const db = getDb();
    res.json({
      teams: db.settings.floorTeams ?? [],
      tables: db.tables.map((table) => ({ id: table.id, number: table.number })),
    });
  });

  router.put("/floor-teams", (req, res) => {
    const teams = req.body?.teams as FloorTeam[] | undefined;
    if (!Array.isArray(teams)) {
      res.status(400).json({ error: "INVALID_TEAMS" });
      return;
    }

    const db = getDb();
    const validationError = validateFloorTeams(
      teams,
      db.tables.map((table) => table.number),
    );

    if (validationError) {
      res.status(400).json({ error: "INVALID_ASSIGNMENT", message: validationError });
      return;
    }

    db.settings = normalizeSettings({
      ...db.settings,
      floorTeams: teams,
    });
    bumpDatabaseMeta(db);
    saveDb(db);
    res.json({ success: true, teams: db.settings.floorTeams, version: db.meta.lastModified });
  });

  router.get("/dealer-timers", (_req, res) => {
    const db = getDb();
    res.json({
      callTimeSeconds: db.settings.dealerCallTimeSeconds ?? 30,
      playerTimeSeconds: db.settings.dealerPlayerTimeSeconds ?? 60,
    });
  });

  router.put("/dealer-timers", (req, res) => {
    const callTimeSeconds = Number(req.body?.callTimeSeconds);
    const playerTimeSeconds = Number(req.body?.playerTimeSeconds);

    if (
      !Number.isFinite(callTimeSeconds) ||
      !Number.isFinite(playerTimeSeconds) ||
      callTimeSeconds < 10 ||
      callTimeSeconds > 120 ||
      playerTimeSeconds < 15 ||
      playerTimeSeconds > 180
    ) {
      res.status(400).json({ error: "INVALID_TIMER_VALUES" });
      return;
    }

    const db = getDb();
    db.settings = normalizeSettings({
      ...db.settings,
      dealerCallTimeSeconds: Math.round(callTimeSeconds),
      dealerPlayerTimeSeconds: Math.round(playerTimeSeconds),
    });
    bumpDatabaseMeta(db);
    saveDb(db);
    res.json({
      success: true,
      callTimeSeconds: db.settings.dealerCallTimeSeconds,
      playerTimeSeconds: db.settings.dealerPlayerTimeSeconds,
      version: db.meta.lastModified,
    });
  });

  return router;
}
