import type { ClockState, HistoryEvent, Player, Table, TournamentSettings } from "../../types";
import type { TournamentDatabase } from "../tournamentDatabase";

/** Factory defaults when db.json is missing — empty tournament, structure template only. */
export function buildDefaultSeedDatabase(): Omit<TournamentDatabase, "dealerRotation" | "meta"> & { meta: { lastModified: number } } {
  const defaultSettings: TournamentSettings = {
    id: "TOURNAMENT-NEW",
    name: "New Tournament",
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
    isMultiDay: false,
    totalDays: 1,
    currentDay: 1,
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
      { level: 12, smallBlind: 1000, bigBlind: 2000, ante: 2000, duration: 20 },
      { level: 13, smallBlind: 1500, bigBlind: 3000, ante: 3000, duration: 20 },
      { level: 14, smallBlind: 2000, bigBlind: 4000, ante: 4000, duration: 20 },
      { level: 15, smallBlind: 0, bigBlind: 0, ante: 0, duration: 15, isBreak: true },
      { level: 16, smallBlind: 3000, bigBlind: 6000, ante: 6000, duration: 20 },
      { level: 17, smallBlind: 4000, bigBlind: 8000, ante: 8000, duration: 20 },
      { level: 18, smallBlind: 5000, bigBlind: 10000, ante: 10000, duration: 20 },
    ],
  };

  const firstLevelMinutes = defaultSettings.blindStructure[0]?.duration ?? 20;

  const defaultClock: ClockState = {
    currentLevelIndex: 0,
    timeRemaining: firstLevelMinutes * 60,
    isRunning: false,
    elapsedTime: 0,
    soundEnabled: true,
    fullscreen: false,
    syncedAtMs: null,
    tournamentStartedAt: null,
  };

  const players: Player[] = [];
  const tables: Table[] = [];
  const defaultHistory: HistoryEvent[] = [];

  return {
    settings: defaultSettings,
    clock: defaultClock,
    players,
    tables,
    history: defaultHistory,
    payouts: [],
    floorCalls: [],
    meta: { lastModified: Date.now() },
  };
}
