import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { Player, Table, TournamentSettings, ClockState, HistoryEvent } from "./src/types";
import { createTrackingRouter } from "./src/tracking/trackingRoutes";
import { registerLicenseRoutes, requireValidLicense } from "./src/license/serverRoutes";
import { applyLocalServerCors } from "./src/config/cors";
import { normalizeDatabase, bumpDatabaseMeta, type TournamentDatabase } from "./src/server/tournamentDatabase";
import { createDealerRouter } from "./src/dealer/dealerRoutes";
import { createFloorRouter, createSettingsRouter } from "./src/floor/floorRoutes";

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.json");
const LOGS_DIR = path.join(process.cwd(), "logs");
const loggedEventIds = new Set<string>();

function formatActivityLogLine(event: HistoryEvent): string {
  const timestamp = new Date(event.timestamp).toLocaleString();
  const player = event.playerName ? ` [${event.playerName}]` : "";
  return `[${timestamp}] ${event.type.toUpperCase()}${player}: ${event.description}`;
}

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function getActivityLogPath(tournamentId: string) {
  const safeId = (tournamentId || "tournament").replace(/[^\w\-]+/g, "_");
  return path.join(LOGS_DIR, `${safeId}-activity.log`);
}

function registerExistingHistory(history: HistoryEvent[] = []) {
  for (const event of history) {
    loggedEventIds.add(event.id);
  }
}

function appendActivityLog(history: HistoryEvent[] = [], tournamentId: string) {
  const newEvents = history.filter((event) => !loggedEventIds.has(event.id));
  if (newEvents.length === 0) return;

  ensureLogsDir();
  const logPath = getActivityLogPath(tournamentId);
  const chronological = [...newEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const lines = chronological.map((event) => formatActivityLogLine(event)).join("\n") + "\n";
  fs.appendFileSync(logPath, lines, "utf-8");

  for (const event of newEvents) {
    loggedEventIds.add(event.id);
  }
}

app.use(express.json());
applyLocalServerCors(app);

function isSeedWaitingPlayer(player: Player): boolean {
  return player.id.startsWith("player-wait-")
    || (player.firstName === "Waiting" && /^Player \d+$/.test(player.lastName));
}

function sanitizeDatabase(db: any) {
  if (!Array.isArray(db.players)) return db;

  const players = (db.players as Player[]).filter(player => !isSeedWaitingPlayer(player));
  const playerIds = new Set(players.map(player => player.id));
  const tables = Array.isArray(db.tables)
    ? (db.tables as Table[]).map(table => ({
        ...table,
        seats: table.seats.map(seatId => (seatId && playerIds.has(seatId) ? seatId : null)),
      }))
    : db.tables;

  return { ...db, players, tables };
}

// Helper to load database with rich defaults matching screenshot_100.png exactly
function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      const sanitized = sanitizeDatabase(raw);
      if (Array.isArray(raw.players) && Array.isArray(sanitized.players) && sanitized.players.length !== raw.players.length) {
        return persistDatabase(sanitized);
      }
      return normalizeDatabase(sanitized);
    } catch (e) {
      console.error("Error reading database, using defaults", e);
    }
  }

  // Fallback defaults matching screenshot_100.png
  const defaultSettings: TournamentSettings = {
    id: "SMPC-2025-08",
    name: "Summer Poker Championship",
    buyIn: 2000,
    fee: 150,
    startingStack: 30000,
    bonusChips: 5000,
    addonChips: 15000,
    rebuyChips: 30000,
    maxPlayers: 150,
    maxTables: 15,
    blindTime: 20,
    breakTime: 15,
    breakFrequency: 6,
    type: "Re-entry",
    lateRegLevel: 7,
    currency: "USD",
    isMultiDay: true,
    totalDays: 3,
    currentDay: 2,
    blindStructure: [
      { level: 1, smallBlind: 100, bigBlind: 200, ante: 200, duration: 20 },
      { level: 2, smallBlind: 200, bigBlind: 300, ante: 300, duration: 20 },
      { level: 3, smallBlind: 200, bigBlind: 400, ante: 400, duration: 20 },
      { level: 4, smallBlind: 300, bigBlind: 600, ante: 600, duration: 20 },
      { level: 5, smallBlind: 400, bigBlind: 800, ante: 800, duration: 20 },
      { level: 6, smallBlind: 500, bigBlind: 1000, ante: 1000, duration: 20 },
      { level: 7, smallBlind: 0, bigBlind: 0, ante: 0, duration: 15, isBreak: true },
      { level: 8, smallBlind: 600, bigBlind: 1200, ante: 1200, duration: 20 },
      { level: 9, smallBlind: 800, bigBlind: 1600, ante: 1600, duration: 20 },
      { level: 10, smallBlind: 1000, bigBlind: 2000, ante: 2000, duration: 20 },
      { level: 11, smallBlind: 1200, bigBlind: 2400, ante: 2400, duration: 20 },
      { level: 12, smallBlind: 1000, bigBlind: 2000, ante: 2000, duration: 20 }, // Level 12 active as per screenshot
      { level: 13, smallBlind: 1500, bigBlind: 3000, ante: 3000, duration: 20 },
      { level: 14, smallBlind: 2000, bigBlind: 4000, ante: 4000, duration: 20 },
      { level: 15, smallBlind: 0, bigBlind: 0, ante: 0, duration: 15, isBreak: true },
      { level: 16, smallBlind: 3000, bigBlind: 6000, ante: 6000, duration: 20 },
      { level: 17, smallBlind: 4000, bigBlind: 8000, ante: 8000, duration: 20 },
      { level: 18, smallBlind: 5000, bigBlind: 10000, ante: 10000, duration: 20 }
    ]
  };

  const defaultClock: ClockState = {
    currentLevelIndex: 11, // Level 12 (0-indexed 11)
    timeRemaining: 1122, // 18:42 in seconds
    isRunning: false,
    elapsedTime: 22818, // 06:42:18 elapsed
    soundEnabled: true,
    fullscreen: false
  };

  // Preload players to make things look incredibly complete (138 Total, 42 Remaining as in screenshot)
  const countries = ["USA", "Turkey", "Germany", "France", "Italy", "Brazil", "UK", "Canada", "Spain", "Japan", "Russia", "Netherlands"];
  const players: Player[] = [];
  
  // High quality names for top players matching screenshot
  const specificPlayers = [
    { firstName: "Ali", lastName: "Yilmaz", nickname: "Ali", country: "Turkey", status: "Eliminated" as const, chips: 0, tableId: null, seatIndex: null, reentries: 0, rebuys: 0, addons: 0, eliminationOrder: 43 },
    { firstName: "Mehmet", lastName: "Demir", nickname: "Mehmet", country: "Turkey", status: "Playing" as const, chips: 120000, tableId: "table-1", seatIndex: 0, reentries: 1, rebuys: 0, addons: 1, eliminationOrder: null },
    { firstName: "John", lastName: "Doe", nickname: "JohnnyD", country: "USA", status: "Playing" as const, chips: 150000, tableId: "table-1", seatIndex: 1, reentries: 0, rebuys: 0, addons: 0, eliminationOrder: null },
    { firstName: "Sarah", lastName: "Conor", nickname: "Terminator", country: "Germany", status: "Playing" as const, chips: 85000, tableId: "table-1", seatIndex: 2, reentries: 0, rebuys: 0, addons: 1, eliminationOrder: null },
    { firstName: "Carlos", lastName: "Silva", nickname: "ElToro", country: "Brazil", status: "Playing" as const, chips: 210000, tableId: "table-1", seatIndex: 3, reentries: 1, rebuys: 0, addons: 1, eliminationOrder: null },
    { firstName: "Jean", lastName: "Dupont", nickname: "Bagguette", country: "France", status: "Playing" as const, chips: 35000, tableId: "table-1", seatIndex: 4, reentries: 0, rebuys: 0, addons: 0, eliminationOrder: null },
    { firstName: "Emma", lastName: "Watson", nickname: "Hermione", country: "UK", status: "Playing" as const, chips: 90000, tableId: "table-2", seatIndex: 0, reentries: 0, rebuys: 0, addons: 1, eliminationOrder: null },
    { firstName: "Yuki", lastName: "Sato", nickname: "Samurai", country: "Japan", status: "Playing" as const, chips: 130000, tableId: "table-2", seatIndex: 1, reentries: 1, rebuys: 0, addons: 0, eliminationOrder: null },
    { firstName: "Max", lastName: "Mustermann", nickname: "Kaiser", country: "Germany", status: "Playing" as const, chips: 75000, tableId: "table-2", seatIndex: 2, reentries: 0, rebuys: 0, addons: 0, eliminationOrder: null },
    { firstName: "Elena", lastName: "Petrova", nickname: "Matryoshka", country: "Russia", status: "Playing" as const, chips: 180000, tableId: "table-2", seatIndex: 3, reentries: 0, rebuys: 0, addons: 1, eliminationOrder: null },
    { firstName: "Antonio", lastName: "Banderas", nickname: "Zorro", country: "Spain", status: "Playing" as const, chips: 45000, tableId: "table-2", seatIndex: 4, reentries: 0, rebuys: 0, addons: 0, eliminationOrder: null }
  ];

  specificPlayers.forEach((p, i) => {
    players.push({
      id: `player-${i + 1}`,
      firstName: p.firstName,
      lastName: p.lastName,
      nickname: p.nickname,
      country: p.country,
      phone: "+1 555-010" + i,
      notes: "Preloaded player",
      status: p.status,
      chips: p.chips,
      tableId: p.tableId,
      seatIndex: p.seatIndex,
      reentries: p.reentries,
      rebuys: p.rebuys,
      addons: p.addons,
      eliminationOrder: p.eliminationOrder,
      registeredAt: new Date(Date.now() - 3600000 * 5).toISOString()
    });
  });

  // Load the remaining to make Total = 138, Playing = 42, Eliminated = 96
  const totalWanted = 138;
  const playingWanted = 42;
  const currentPlayingCount = players.filter(p => p.status === 'Playing').length;
  const currentEliminatedCount = players.filter(p => p.status === 'Eliminated').length;

  for (let i = players.length; i < totalWanted; i++) {
    const isPlaying = (players.filter(p => p.status === 'Playing').length < playingWanted);
    const country = countries[Math.floor(Math.random() * countries.length)];
    const status = isPlaying ? "Playing" : "Eliminated";
    const tableId = isPlaying ? `table-${Math.floor(Math.random() * 5) + 1}` : null;
    
    players.push({
      id: `player-${i + 1}`,
      firstName: `Player`,
      lastName: `${i + 1}`,
      nickname: `ProPlayer_${i + 1}`,
      country: country,
      phone: `+1 555-01${i}`,
      notes: `Automated seed player ${i + 1}`,
      status: status,
      chips: isPlaying ? 97400 : 0, // 97,400 chip stack to make average exactly 97,400
      tableId: tableId,
      seatIndex: null, // Will seat them dynamically or keep in playing status
      reentries: Math.random() > 0.8 ? 1 : 0,
      rebuys: 0,
      addons: Math.random() > 0.5 ? 1 : 0,
      eliminationOrder: isPlaying ? null : (i - 40),
      registeredAt: new Date(Date.now() - 3600000 * 4).toISOString()
    });
  }

  // Define tables
  const tables: Table[] = [];
  for (let t = 1; t <= 5; t++) {
    const tableId = `table-${t}`;
    const seats: (string | null)[] = Array(10).fill(null);
    
    // Distribute playing players into seats for tables
    const tablePlayers = players.filter(p => p.status === "Playing" && p.tableId === tableId);
    tablePlayers.forEach((p, index) => {
      if (index < 10) {
        seats[index] = p.id;
        p.seatIndex = index;
      } else {
        // Overflow playing players get reset table seating or status
        p.tableId = null;
        p.seatIndex = null;
      }
    });

    tables.push({
      id: tableId,
      number: t,
      dealerSeatIndex: Math.floor(Math.random() * 10),
      seats: seats
    });
  }

  // Seat other playing players that were generated randomly without seats
  const unseatedPlaying = players.filter(p => p.status === "Playing" && p.seatIndex === null);
  unseatedPlaying.forEach(p => {
    // Find first empty seat across tables 1-5
    for (const t of tables) {
      const emptyIdx = t.seats.indexOf(null);
      if (emptyIdx !== -1) {
        t.seats[emptyIdx] = p.id;
        p.tableId = t.id;
        p.seatIndex = emptyIdx;
        break;
      }
    }
  });

  // Default HistoryEvents matching screenshot_100.png exactly
  const defaultHistory: HistoryEvent[] = [
    { id: "h1", timestamp: new Date(Date.now() - 25 * 60000).toISOString(), type: "undo", description: "Payout updated" },
    { id: "h2", timestamp: new Date(Date.now() - 18 * 60000).toISOString(), type: "undo", description: "Level 11 completed" },
    { id: "h3", timestamp: new Date(Date.now() - 12 * 60000).toISOString(), type: "undo", description: "Break finished" },
    { id: "h4", timestamp: new Date(Date.now() - 10 * 60000).toISOString(), type: "undo", description: "Registration closed" },
    { id: "h5", timestamp: new Date(Date.now() - 7 * 60000).toISOString(), type: "registration", description: "New player registered" },
    { id: "h6", timestamp: new Date(Date.now() - 5 * 60000).toISOString(), type: "reentry", description: "Mehmet re-entry" },
    { id: "h7", timestamp: new Date(Date.now() - 3 * 60000).toISOString(), type: "balance", description: "Table 3 balanced" },
    { id: "h8", timestamp: new Date(Date.now() - 2 * 60000).toISOString(), type: "bust", description: "Ali eliminated" }
  ];

  const db = {
    settings: defaultSettings,
    clock: defaultClock,
    players: players,
    tables: tables,
    history: defaultHistory,
    payouts: [],
    floorCalls: [],
    meta: { lastModified: Date.now() },
  };

  return persistDatabase(db);
}

function persistDatabase(data: Partial<TournamentDatabase>): TournamentDatabase {
  const normalized = normalizeDatabase(data);
  bumpDatabaseMeta(normalized);
  const tempPath = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf-8");
  fs.renameSync(tempPath, DB_FILE);
  appendActivityLog(normalized.history || [], normalized.settings?.id || "tournament");
  return normalized;
}

function saveDatabase(data: TournamentDatabase) {
  try {
    db = persistDatabase(data);
  } catch (e) {
    console.error("Error writing database file", e);
  }
}

// Ensure database file is generated
let db: TournamentDatabase = normalizeDatabase(loadDatabase());
registerExistingHistory(db.history || []);

const licenseGuard = requireValidLicense();

function getDb(): TournamentDatabase {
  return db;
}

function setDb(next: TournamentDatabase) {
  saveDatabase(next);
}

// API Endpoints
app.get("/api/data", licenseGuard, (req, res) => {
  res.json(db);
});

app.get("/api/data/meta", licenseGuard, (_req, res) => {
  res.json({ lastModified: db.meta.lastModified });
});

app.post("/api/save", licenseGuard, (req, res) => {
  const incomingClientModified = Number(req.body?.meta?.lastModified) || 0;
  const incoming = normalizeDatabase({
    ...req.body,
    floorCalls: Array.isArray(req.body?.floorCalls) ? req.body.floorCalls : db.floorCalls,
  });

  if (db.meta.lastModified > incomingClientModified) {
    incoming.players = db.players;
    incoming.tables = db.tables;
    incoming.history = db.history;
    incoming.floorCalls = db.floorCalls;
    incoming.payouts = db.payouts;
  }

  saveDatabase(incoming);
  res.json({
    success: true,
    message: "Database saved successfully",
    lastModified: db.meta.lastModified,
    data: db,
  });
});

app.post("/api/reset", licenseGuard, (req, res) => {
  if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }
  db = normalizeDatabase(loadDatabase());
  registerExistingHistory(db.history || []);
  res.json({ success: true, data: db, message: "Database reset to factory defaults" });
});

app.get("/api/activity-log", licenseGuard, (req, res) => {
  const tournamentId = db.settings?.id || "tournament";
  const logPath = getActivityLogPath(tournamentId);

  if (fs.existsSync(logPath)) {
    res.type("text/plain").send(fs.readFileSync(logPath, "utf-8"));
    return;
  }

  const fallback = [...(db.history || [])]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((event) => formatActivityLogLine(event))
    .join("\n");

  res.type("text/plain").send(fallback);
});

// QR Live Tracking — local read-only tracking server
app.use("/api/tracking", (req, res, next) => {
  if (req.path === "/ping") {
    next();
    return;
  }

  licenseGuard(req, res, next);
}, createTrackingRouter(PORT, () => db));

app.use("/api/dealer", licenseGuard, createDealerRouter(PORT, getDb, setDb));
app.use("/api/floor", licenseGuard, createFloorRouter(PORT, getDb, setDb));
app.use("/api/settings", licenseGuard, createSettingsRouter(getDb, setDb));

// License machine ID + local license storage
registerLicenseRoutes(app);

function openBrowser(url: string) {
  if (process.env.TM_AUTO_OPEN_BROWSER === "0") {
    return;
  }

  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(command, { shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" }, (error) => {
    if (error) {
      console.error("Could not open browser automatically:", error.message);
      console.log(`Open this URL manually: ${url}`);
    }
  });
}

// Setup Vite Dev Server / Prod Server Static
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const appUrl = `http://localhost:${PORT}`;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server listening on ${appUrl}`);
    console.log(`QR Live Tracking (Phase 1): ${appUrl}/track`);
    console.log(`Dealer Tablet: ${appUrl}/dealer/setup?table=1`);
    console.log(`Floor Mobile: ${appUrl}/floor?team=floor-1`);
    openBrowser(appUrl);
  });
}

startServer();
