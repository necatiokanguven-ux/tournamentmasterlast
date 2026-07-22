/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  duration: number; // in minutes
  isBreak?: boolean;
}

export type PlayerStatus = 'Registered' | 'Playing' | 'Eliminated' | 'Waiting' | 'Re-entry';

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  country: string;
  phone: string;
  notes: string;
  birthDate?: string | null;
  status: PlayerStatus;
  chips: number;
  tableId: string | null;
  seatIndex: number | null; // 0-indexed (0 to 9)
  reentries: number;
  rebuys: number;
  addons: number;
  eliminationOrder: number | null;
  registeredAt: string;
}

export interface Table {
  id: string;
  number: number;
  dealerSeatIndex: number; // 0 to 8
  seats: (string | null)[]; // player seats 1–9 (length 9)
}

/** Standard poker table capacity (seats 1–9). */
export const MAX_TABLE_SEATS = 9;

export type TournamentType = 
  | 'Freezeout' 
  | 'Rebuy' 
  | 'Re-entry' 
  | 'Knockout' 
  | 'Bounty' 
  | 'Mystery Bounty' 
  | 'Turbo' 
  | 'Hyper Turbo';

export type TournamentCurrency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'TRY'
  | 'CHF'
  | 'CAD'
  | 'AUD';

export interface FloorTeam {
  id: string;
  name: string;
  /** Linked floor staff from Personel Control roster */
  staffId?: string;
  tableNumbers: number[];
}

export interface DealerZone {
  id: string;
  name: string;
  tableNumbers: number[];
}

export type FloorCallStatus = 'pending' | 'acknowledged' | 'resolved';
export type FloorCallKind = 'floor_request' | 'player_eliminated';

export interface FloorCall {
  id: string;
  tableNumber: number;
  tableId: string;
  teamId: string;
  kind?: FloorCallKind;
  playerId?: string | null;
  playerName?: string | null;
  status: FloorCallStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
}

export type DealerTimerModeSetting = "none" | "call_time" | "player_time";

export interface TournamentSettings {
  id: string;
  name: string;
  buyIn: number;
  fee: number;
  currency?: TournamentCurrency;
  startingStack: number;
  bonusChips: number;
  addonChips: number;
  rebuyChips: number;
  maxPlayers: number;
  maxTables: number;
  blindTime: number; // minutes per level
  breakTime: number; // minutes per break
  breakFrequency: number; // every N levels
  type: TournamentType;
  blindStructure: BlindLevel[];
  lateRegLevel: number;
  customPrizePool?: number;
  isMultiDay?: boolean;
  totalDays?: number;
  currentDay?: number;
  dealerCallTimeSeconds?: number;
  dealerPlayerTimeSeconds?: number;
  /** Operator-selected timer feature: none, call time only, or player time only. */
  dealerTimerMode?: DealerTimerModeSetting;
  floorTeams?: FloorTeam[];
  /** Phase 6 — dealer zones (active only when DEALER_ZONES=true). */
  dealerZones?: DealerZone[];
}

export interface ClockState {
  currentLevelIndex: number;
  timeRemaining: number; // in seconds
  isRunning: boolean;
  elapsedTime: number; // in seconds
  soundEnabled: boolean;
  fullscreen: boolean;
  /** Wall-clock ms when timeRemaining was last synced to the server. */
  syncedAtMs?: number | null;
  /** ISO timestamp when the tournament clock was first started. */
  tournamentStartedAt?: string | null;
}

export interface HistoryEvent {
  id: string;
  timestamp: string;
  type: 'registration' | 'seating' | 'bust' | 'rebuy' | 'reentry' | 'addon' | 'disqualify' | 'move' | 'balance' | 'undo' | 'clock' | 'level' | 'settings';
  playerId?: string;
  playerName?: string;
  description: string;
}

export interface PayoutStructure {
  rank: number;
  percentage: number;
  amount: number;
}
