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
  averageStackBB: number;
  currentBigBlind: number;
  prizePool: number;
  payouts: Array<{ rank: number; percentage: number; amount: number }>;
  nextBreak: string;
  isBubbleTime: boolean;
  isFinalTable: boolean;
  playersToItm: number;
};

type TrackingLiveStateInput = Partial<TrackingLiveState> & {
  payouts?: Array<Partial<{ rank: number; percentage: number; amount: number }>> | null;
  currentBigBlind?: number;
};

const DEFAULT_PAYOUT_PERCENTAGES = [
  30.0, 19.0, 13.5, 9.5, 7.0, 5.5, 4.2, 3.2, 2.5, 2.1, 1.8, 1.7,
];

function parseTrackingNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  let normalized = value.trim();
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, "");
  } else if (hasDot) {
    const parts = normalized.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      normalized = normalized.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function derivePayoutsFromPrizePool(prizePool: number) {
  if (prizePool <= 0) {
    return [];
  }

  return DEFAULT_PAYOUT_PERCENTAGES.map((percentage, index) => ({
    rank: index + 1,
    percentage,
    amount: Math.round((prizePool * (percentage / 100)) / 50) * 50,
  }));
}

export function parseBigBlindFromBlindsLabel(blinds?: string | null): number {
  if (!blinds || blinds === "BREAK" || blinds === "-") {
    return 0;
  }

  const match = blinds.match(/\/\s*([\d.,]+)/);
  if (!match?.[1]) {
    return 0;
  }

  return parseTrackingNumber(match[1]);
}

function normalizeTrackingPayouts(
  rawPayouts: TrackingLiveStateInput["payouts"],
  prizePool: number,
) {
  let payouts = Array.isArray(rawPayouts)
    ? rawPayouts.map((payout, index) => ({
        rank: parseTrackingNumber(payout.rank) || index + 1,
        percentage: parseTrackingNumber(payout.percentage),
        amount: parseTrackingNumber(payout.amount),
      }))
    : [];

  const hasUsablePayouts = payouts.some((payout) => payout.amount > 0);
  if (!hasUsablePayouts && prizePool > 0) {
    payouts = derivePayoutsFromPrizePool(prizePool);
  }

  return payouts;
}

export function normalizeTrackingLiveState(state: TrackingLiveStateInput): TrackingLiveState {
  const currency = normalizeTournamentCurrency(state.currency);
  const currencySymbol = state.currencySymbol ?? getCurrencyConfig(currency).symbol;
  const prizePool = parseTrackingNumber(state.prizePool);
  const averageStack = parseTrackingNumber(state.averageStack);
  let averageStackBB = parseTrackingNumber(state.averageStackBB);
  let currentBigBlind = parseTrackingNumber(state.currentBigBlind);

  if (currentBigBlind <= 0) {
    currentBigBlind = parseBigBlindFromBlindsLabel(state.currentBlinds);
  }

  if (currentBigBlind <= 0 && state.isBreak) {
    currentBigBlind = parseBigBlindFromBlindsLabel(state.nextBlinds);
  }

  if (averageStackBB <= 0 && averageStack > 0 && currentBigBlind > 0) {
    averageStackBB = Math.round(averageStack / currentBigBlind);
  }

  return {
    version: typeof state.version === "number" ? state.version : 0,
    serverTime: state.serverTime ?? new Date().toISOString(),
    tournamentName: state.tournamentName ?? "Tournament",
    currency,
    currencySymbol,
    currentLevel: typeof state.currentLevel === "number" ? state.currentLevel : 1,
    isBreak: Boolean(state.isBreak),
    currentBlinds: state.currentBlinds ?? "-",
    nextBlinds: state.nextBlinds ?? null,
    timeRemaining: typeof state.timeRemaining === "number" ? state.timeRemaining : 0,
    isRunning: Boolean(state.isRunning),
    remainingPlayers: typeof state.remainingPlayers === "number" ? state.remainingPlayers : 0,
    totalPlayers: typeof state.totalPlayers === "number" ? state.totalPlayers : 0,
    playersDisplay: state.playersDisplay ?? "-",
    averageStack,
    averageStackBB,
    prizePool,
    payouts: normalizeTrackingPayouts(state.payouts, prizePool),
    nextBreak: state.nextBreak ?? "--:--:--",
    isBubbleTime: Boolean(state.isBubbleTime),
    isFinalTable: Boolean(state.isFinalTable),
    playersToItm: typeof state.playersToItm === "number" ? state.playersToItm : 0,
    currentBigBlind,
  };
}

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

function getCurrentBigBlind(structure: BlindLevel[], levelIndex: number): number {
  for (let i = levelIndex; i >= 0; i--) {
    const level = structure[i];
    if (level && !level.isBreak && level.bigBlind > 0) {
      return level.bigBlind;
    }
  }

  for (const level of structure) {
    if (!level.isBreak && level.bigBlind > 0) {
      return level.bigBlind;
    }
  }

  return 1;
}

export function resolveTrackingPayouts(
  settings: TournamentSettings,
  players: Player[],
  payouts?: PayoutStructure[],
): PayoutStructure[] {
  if (Array.isArray(payouts) && payouts.length > 0) {
    return payouts.map((payout, index) => ({
      rank: typeof payout.rank === "number" ? payout.rank : index + 1,
      percentage: typeof payout.percentage === "number" ? payout.percentage : 0,
      amount: typeof payout.amount === "number" ? payout.amount : 0,
    }));
  }

  const prizePool = calculatePrizePool(settings, players);

  return DEFAULT_PAYOUT_PERCENTAGES.map((percentage, index) => ({
    rank: index + 1,
    percentage,
    amount: Math.round((prizePool * (percentage / 100)) / 50) * 50,
  }));
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
  const { settings, clock, players, payouts } = input;
  const resolvedPayouts = resolveTrackingPayouts(settings, players, payouts);
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
  const currentBigBlind = getCurrentBigBlind(structure, clock.currentLevelIndex);
  const averageStackBB = currentBigBlind > 0 ? Math.round(averageStack / currentBigBlind) : 0;
  const currency = normalizeTournamentCurrency(settings.currency);
  const currencySymbol = getCurrencyConfig(currency).symbol;
  const finalTablePlayers = 9;
  const isFinalTable = remainingPlayers === finalTablePlayers;
  const isBubbleTime = resolvedPayouts.length > 0 && remainingPlayers === resolvedPayouts.length + 1 && !isFinalTable;
  const playersToItm = isBubbleTime ? 1 : Math.max(0, remainingPlayers - resolvedPayouts.length);

  return {
    version: Date.now(),
    serverTime: new Date().toISOString(),
    tournamentName: settings.name,
    currency,
    currencySymbol,
  currentLevel: activeLevel?.isBreak
    ? currentStandardLevel
    : (activeLevel?.level && activeLevel.level > 0 ? activeLevel.level : currentStandardLevel),
    isBreak: Boolean(activeLevel?.isBreak),
    currentBlinds: activeLevel ? formatBlinds(activeLevel) : "-",
    nextBlinds: nextLevel ? formatBlinds(nextLevel) : null,
    timeRemaining: clock.timeRemaining,
    isRunning: clock.isRunning,
    remainingPlayers,
    totalPlayers,
    playersDisplay: `${totalPlayers}/${remainingPlayers}`,
    averageStack,
    averageStackBB,
    currentBigBlind,
    prizePool: calculatePrizePool(settings, players),
    payouts: resolvedPayouts.map((payout) => ({
      rank: payout.rank,
      percentage: payout.percentage,
      amount: payout.amount,
    })),
    nextBreak: calculateTimeToNextBreak(settings, clock),
    isBubbleTime,
    isFinalTable,
    playersToItm,
  };
}

export function formatTrackingAverageStack(state: TrackingLiveStateInput): string {
  const normalized = normalizeTrackingLiveState(state);
  const stackLabel = Math.round(normalized.averageStack).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  if (normalized.averageStackBB > 0) {
    return `${normalized.averageStackBB} BB / ${stackLabel}`;
  }

  return stackLabel;
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
  const currentPayouts = current.payouts ?? [];
  const incomingPayouts = incoming.payouts ?? [];

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
    currentPayouts.length !== incomingPayouts.length ||
    currentPayouts.some((payout, index) => {
      const next = incomingPayouts[index];
      return !next
        || payout.rank !== next.rank
        || payout.percentage !== next.percentage
        || payout.amount !== next.amount;
    }) ||
    current.nextBreak !== incoming.nextBreak ||
    current.isBubbleTime !== incoming.isBubbleTime ||
    current.isFinalTable !== incoming.isFinalTable ||
    current.playersToItm !== incoming.playersToItm
  );
}

export function mergeTrackingLiveState(
  current: TrackingLiveState | null,
  incoming: TrackingLiveStateInput,
): TrackingLiveState {
  const incomingIncludesPayouts = Object.prototype.hasOwnProperty.call(incoming, "payouts");
  let normalizedIncoming = normalizeTrackingLiveState(incoming);

  if (current && !incomingIncludesPayouts) {
    const normalizedCurrent = normalizeTrackingLiveState(current);
    if (normalizedCurrent.payouts.length > 0) {
      normalizedIncoming = {
        ...normalizedIncoming,
        payouts: normalizedCurrent.payouts,
      };
    }
  }

  if (!current) {
    return normalizedIncoming;
  }

  const normalizedCurrent = normalizeTrackingLiveState(current);

  if (hasStructuralLiveStateChange(normalizedCurrent, normalizedIncoming)) {
    return normalizedIncoming;
  }

  const drift = Math.abs(normalizedCurrent.timeRemaining - normalizedIncoming.timeRemaining);
  if (drift >= 3) {
    return {
      ...normalizedCurrent,
      timeRemaining: normalizedIncoming.timeRemaining,
      serverTime: normalizedIncoming.serverTime,
      version: normalizedIncoming.version,
    };
  }

  return normalizedCurrent;
}
