import { BlindLevel, ClockState, Player, PayoutStructure, TournamentCurrency, TournamentSettings } from "../types";
import { getCurrencyConfig, normalizeTournamentCurrency } from "../currency";

export type TrackingLiveState = {
  version: number;
  serverTime: string;
  tournamentName: string;
  currency: TournamentCurrency;
  currencySymbol: string;
  currentLevel: number;
  isBreak: boolean;
  currentBlinds: string;
  nextBlinds: string | null;
  timeRemaining: number;
  isRunning: boolean;
  remainingPlayers: number;
  totalPlayers: number;
  playersDisplay: string;
  averageStack: number;
  prizePool: number;
  nextBreak: string;
  isBubbleTime: boolean;
  isFinalTable: boolean;
  playersToItm: number;
};

type BuildLiveStateInput = {
  settings: TournamentSettings;
  clock: ClockState;
  players: Player[];
  payouts?: PayoutStructure[];
};

function formatBlinds(level: BlindLevel): string {
  if (level.isBreak) {
    return "BREAK";
  }
  if (level.ante > 0) {
    return `${level.smallBlind.toLocaleString()} / ${level.bigBlind.toLocaleString()} (${level.ante.toLocaleString()})`;
  }
  return `${level.smallBlind.toLocaleString()} / ${level.bigBlind.toLocaleString()}`;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function getNextNonBreakLevel(structure: BlindLevel[], startIndex: number): BlindLevel | null {
  for (let i = startIndex; i < structure.length; i++) {
    if (!structure[i]?.isBreak) {
      return structure[i];
    }
  }
  return null;
}

function calculatePrizePool(settings: TournamentSettings, players: Player[]): number {
  const totalPlayers = players.length;
  const totalReentries = players.reduce((sum, player) => sum + (player.reentries || 0), 0);
  const totalRebuys = players.reduce((sum, player) => sum + (player.rebuys || 0), 0);
  const totalAddons = players.reduce((sum, player) => sum + (player.addons || 0), 0);
  const totalEntriesCount = totalPlayers + totalReentries;
  const calculatedPrizePool = (totalEntriesCount + totalRebuys + totalAddons) * settings.buyIn;

  return settings.customPrizePool !== undefined && settings.customPrizePool !== null
    ? settings.customPrizePool
    : calculatedPrizePool;
}

function calculateTimeToNextBreak(settings: TournamentSettings, clock: ClockState): string {
  let secs = clock.timeRemaining;

  for (let i = clock.currentLevelIndex + 1; i < settings.blindStructure.length; i++) {
    const level = settings.blindStructure[i];
    if (level.isBreak) {
      break;
    }
    secs += level.duration * 60;
  }

  return formatDuration(secs);
}

export function buildTrackingLiveState(input: BuildLiveStateInput): TrackingLiveState {
  const { settings, clock, players, payouts = [] } = input;
  const structure = settings.blindStructure;
  const activeLevel = structure[clock.currentLevelIndex] ?? structure[0];
  const playingPlayers = players.filter((player) => player.status === "Playing" || player.status === "Waiting");
  const remainingPlayers = playingPlayers.length;
  const totalPlayers = players.length;
  const totalChipsInPlay = players.reduce((sum, player) => sum + player.chips, 0);
  const averageStack = remainingPlayers > 0 ? Math.round(totalChipsInPlay / remainingPlayers) : 0;

  const currentStandardLevel =
    structure.slice(0, clock.currentLevelIndex + 1).filter((level) => !level.isBreak).pop()?.level ?? 1;

  const nextLevel = getNextNonBreakLevel(structure, clock.currentLevelIndex + 1);
  const currency = normalizeTournamentCurrency(settings.currency);
  const currencySymbol = getCurrencyConfig(currency).symbol;
  const finalTablePlayers = 9;
  const isFinalTable = remainingPlayers === finalTablePlayers;
  const isBubbleTime = payouts.length > 0 && remainingPlayers === payouts.length + 1 && !isFinalTable;
  const playersToItm = isBubbleTime ? 1 : Math.max(0, remainingPlayers - payouts.length);

  return {
    version: Date.now(),
    serverTime: new Date().toISOString(),
    tournamentName: settings.name,
    currency,
    currencySymbol,
    currentLevel: activeLevel?.isBreak ? currentStandardLevel : activeLevel.level,
    isBreak: Boolean(activeLevel?.isBreak),
    currentBlinds: activeLevel ? formatBlinds(activeLevel) : "-",
    nextBlinds: nextLevel ? formatBlinds(nextLevel) : null,
    timeRemaining: clock.timeRemaining,
    isRunning: clock.isRunning,
    remainingPlayers,
    totalPlayers,
    playersDisplay: `${totalPlayers}/${remainingPlayers}`,
    averageStack,
    prizePool: calculatePrizePool(settings, players),
    nextBreak: calculateTimeToNextBreak(settings, clock),
    isBubbleTime,
    isFinalTable,
    playersToItm,
  };
}

export function formatTrackingClock(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function hasStructuralLiveStateChange(
  current: TrackingLiveState,
  incoming: TrackingLiveState,
): boolean {
  return (
    current.tournamentName !== incoming.tournamentName ||
    current.currency !== incoming.currency ||
    current.currencySymbol !== incoming.currencySymbol ||
    current.currentLevel !== incoming.currentLevel ||
    current.isBreak !== incoming.isBreak ||
    current.currentBlinds !== incoming.currentBlinds ||
    current.nextBlinds !== incoming.nextBlinds ||
    current.isRunning !== incoming.isRunning ||
    current.remainingPlayers !== incoming.remainingPlayers ||
    current.totalPlayers !== incoming.totalPlayers ||
    current.playersDisplay !== incoming.playersDisplay ||
    current.averageStack !== incoming.averageStack ||
    current.prizePool !== incoming.prizePool ||
    current.nextBreak !== incoming.nextBreak ||
    current.isBubbleTime !== incoming.isBubbleTime ||
    current.isFinalTable !== incoming.isFinalTable ||
    current.playersToItm !== incoming.playersToItm
  );
}

export function mergeTrackingLiveState(
  current: TrackingLiveState | null,
  incoming: TrackingLiveState,
): TrackingLiveState | null {
  if (!current) {
    return incoming;
  }

  if (hasStructuralLiveStateChange(current, incoming)) {
    return incoming;
  }

  const drift = Math.abs(current.timeRemaining - incoming.timeRemaining);
  if (drift >= 3) {
    return {
      ...current,
      timeRemaining: incoming.timeRemaining,
      serverTime: incoming.serverTime,
      version: incoming.version,
    };
  }

  return current;
}
