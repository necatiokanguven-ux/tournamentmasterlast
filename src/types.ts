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
  dealerSeatIndex: number; // 0 to 9
  seats: (string | null)[]; // array of playerIds of length 10
}

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
}

export interface ClockState {
  currentLevelIndex: number;
  timeRemaining: number; // in seconds
  isRunning: boolean;
  elapsedTime: number; // in seconds
  soundEnabled: boolean;
  fullscreen: boolean;
}

export interface HistoryEvent {
  id: string;
  timestamp: string;
  type: 'registration' | 'seating' | 'bust' | 'rebuy' | 'reentry' | 'addon' | 'disqualify' | 'move' | 'balance' | 'undo';
  playerId?: string;
  playerName?: string;
  description: string;
}

export interface PayoutStructure {
  rank: number;
  percentage: number;
  amount: number;
}
