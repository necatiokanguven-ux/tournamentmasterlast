/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Player, Table, TournamentSettings, ClockState, HistoryEvent, BlindLevel, PayoutStructure, FloorTeam } from "./types";
import { localApi } from "./config/api";

export interface AppState {
  settings: TournamentSettings;
  clock: ClockState;
  players: Player[];
  tables: Table[];
  history: HistoryEvent[];
  payouts: PayoutStructure[];
}

interface TableUndoSnapshot {
  players: Player[];
  tables: Table[];
  payouts: PayoutStructure[];
  history: HistoryEvent[];
}

const MAX_TABLE_UNDO_STACK = 50;

// Custom simple event emitter for React components to subscribe to store updates
type Listener = (state: AppState) => void;
class Store {
  private state!: AppState;
  private listeners: Set<Listener> = new Set();
  private timerId: any = null;
  private tableUndoStack: TableUndoSnapshot[] = [];
  private isApplyingTableUndo = false;
  private hasLoadedFromServer = false;
  private sessionDirty = false;
  private saveChain: Promise<void> = Promise.resolve();
  private debouncedPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastServerModified = 0;
  private serverSyncTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): AppState {
    return {
      settings: {
        id: "SMPC-2025-08",
        name: "Summer Poker Championship",
        buyIn: 2000,
        fee: 150,
        startingStack: 50000,
        bonusChips: 5000,
        addonChips: 15000,
        rebuyChips: 30000,
        maxPlayers: 150,
        maxTables: 15,
        blindTime: 20,
        breakTime: 15,
        breakFrequency: 6,
        type: "Re-entry",
        blindStructure: [],
        lateRegLevel: 7,
        currency: "USD",
        isMultiDay: true,
        totalDays: 3,
        currentDay: 2,
        dealerCallTimeSeconds: 30,
        dealerPlayerTimeSeconds: 60,
        floorTeams: [],
      },
      clock: {
        currentLevelIndex: 0,
        timeRemaining: 1200,
        isRunning: false,
        elapsedTime: 0,
        soundEnabled: true,
        fullscreen: false
      },
      players: [],
      tables: [],
      history: [],
      payouts: []
    };
  }

  public getState(): AppState {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.state));
  }

  private cloneAppState(state: AppState = this.state): AppState {
    return {
      settings: {
        ...state.settings,
        blindStructure: state.settings.blindStructure.map(level => ({ ...level })),
        floorTeams: (state.settings.floorTeams ?? []).map(team => ({
          ...team,
          tableNumbers: [...team.tableNumbers],
        })),
      },
      clock: { ...state.clock },
      players: state.players.map(player => ({ ...player })),
      tables: state.tables.map(table => ({ ...table, seats: [...table.seats] })),
      history: state.history.map(event => ({ ...event })),
      payouts: state.payouts.map(payout => ({ ...payout })),
    };
  }

  private enqueuePersist(snapshot: AppState = this.cloneAppState()) {
    this.saveChain = this.saveChain
      .then(() => this.persistSnapshot(snapshot))
      .catch(error => {
        console.error("Failed to save data to backend", error);
      });
  }

  private async persistSnapshot(snapshot: AppState) {
    const response = await fetch(localApi("/api/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...snapshot,
        meta: { lastModified: this.lastServerModified },
      }),
    });
    if (response.ok) {
      const data = await response.json();
      this.lastServerModified = data.lastModified ?? this.lastServerModified;

      if (data.data?.players) {
        const keepLocalClock = this.state.clock.isRunning;
        const localClock = { ...this.state.clock };
        this.applyServerPayload(data.data);
        if (keepLocalClock) {
          this.state.clock = localClock;
        }
      }

      this.sessionDirty = false;
    }
  }

  private scheduleDebouncedPersist() {
    if (this.debouncedPersistTimer) {
      clearTimeout(this.debouncedPersistTimer);
    }

    this.debouncedPersistTimer = setTimeout(() => {
      this.debouncedPersistTimer = null;
      this.enqueuePersist();
    }, 1500);
  }

  public flushPendingSaves(): Promise<void> {
    return this.saveChain;
  }

  private emit() {
    this.sessionDirty = true;
    this.notify();
    this.enqueuePersist();
  }

  private emitDebounced() {
    this.sessionDirty = true;
    this.notify();
    this.scheduleDebouncedPersist();
  }

  private isSeedWaitingPlayer(player: Player): boolean {
    return player.id.startsWith('player-wait-')
      || (player.firstName === 'Waiting' && /^Player \d+$/.test(player.lastName));
  }

  private normalizeLoadedSettings(data: Partial<TournamentSettings> | undefined): TournamentSettings {
    return {
      ...(data ?? this.getInitialState().settings),
      lateRegLevel: data?.lateRegLevel ?? 7,
      isMultiDay: data?.isMultiDay ?? false,
      totalDays: data?.totalDays ?? 0,
      currentDay: data?.currentDay ?? 1,
      dealerCallTimeSeconds: data?.dealerCallTimeSeconds ?? 30,
      dealerPlayerTimeSeconds: data?.dealerPlayerTimeSeconds ?? 60,
      floorTeams: data?.floorTeams ?? [],
    } as TournamentSettings;
  }

  private applyServerPayload(data: any) {
    const settings = this.normalizeLoadedSettings(data.settings);
    const { players, tables } = this.sanitizeLoadedPlayers(data.players || [], data.tables || []);
    const wasRunning = this.state.clock.isRunning;

    this.state = {
      settings,
      clock: {
        ...data.clock,
        soundEnabled: data.clock?.soundEnabled ?? true,
      },
      players,
      tables,
      history: data.history || [],
      payouts: data.payouts && data.payouts.length > 0
        ? data.payouts
        : this.calculatePayouts(settings, players),
    };
    this.reconcileTableSeats();
    this.lastServerModified = data.meta?.lastModified ?? this.lastServerModified;

    if (this.state.clock.isRunning && !wasRunning) {
      this.startTimerInternal();
    } else if (!this.state.clock.isRunning && wasRunning) {
      this.stopTimerInternal();
    }

    this.notify();
  }

  private startServerSync() {
    if (this.serverSyncTimer) {
      clearInterval(this.serverSyncTimer);
    }

    this.serverSyncTimer = setInterval(() => {
      void this.syncFromServer();
    }, 2000);
  }

  public async syncFromServer() {
    try {
      const metaRes = await fetch(localApi("/api/data/meta"));
      if (!metaRes.ok) return;
      const meta = await metaRes.json();
      const remoteModified = Number(meta.lastModified) || 0;
      if (remoteModified <= this.lastServerModified) {
        return;
      }

      const res = await fetch(localApi("/api/data"));
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.players) return;

      const keepLocalClock = this.state.clock.isRunning;
      const localClock = { ...this.state.clock };

      this.applyServerPayload(data);

      if (keepLocalClock) {
        this.state.clock = localClock;
      }

      this.lastServerModified = remoteModified;
      if (!keepLocalClock) {
        this.sessionDirty = false;
      }
    } catch (error) {
      console.warn("Failed to sync tournament data from server", error);
    }
  }

  public async saveFloorTeams(teams: FloorTeam[]) {
    const res = await fetch(localApi("/api/settings/floor-teams"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to save floor teams.");
    }

    this.state = {
      ...this.state,
      settings: {
        ...this.state.settings,
        floorTeams: data.teams ?? teams,
      },
    };
    this.lastServerModified = data.version ?? this.lastServerModified;
    this.notify();
  }

  public async saveDealerTimers(callTimeSeconds: number, playerTimeSeconds: number) {
    const res = await fetch(localApi("/api/settings/dealer-timers"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callTimeSeconds, playerTimeSeconds }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save dealer timers.");
    }

    this.state = {
      ...this.state,
      settings: {
        ...this.state.settings,
        dealerCallTimeSeconds: data.callTimeSeconds,
        dealerPlayerTimeSeconds: data.playerTimeSeconds,
      },
    };
    this.lastServerModified = data.version ?? this.lastServerModified;
    this.notify();
  }

  private sanitizeLoadedPlayers(players: Player[], tables: Table[]): { players: Player[]; tables: Table[] } {
    const cleanedPlayers = players.filter(player => !this.isSeedWaitingPlayer(player));
    const playerIds = new Set(cleanedPlayers.map(player => player.id));

    const cleanedTables = tables.map(table => ({
      ...table,
      seats: table.seats.map(seatId => (seatId && playerIds.has(seatId) ? seatId : null)),
    }));

    return { players: cleanedPlayers, tables: cleanedTables };
  }

  // Load from backend
  public async load(options?: { force?: boolean }) {
    if (this.hasLoadedFromServer && !options?.force) {
      return;
    }

    try {
      await this.flushPendingSaves();
      const res = await fetch(localApi("/api/data"));
      const data = await res.json();
      if (data && data.players) {
        if (this.sessionDirty && !options?.force) {
          this.hasLoadedFromServer = true;
          return;
        }

        const settings = this.normalizeLoadedSettings(data.settings);
        const { players, tables } = this.sanitizeLoadedPlayers(data.players, data.tables || []);
        this.state = {
          settings,
          clock: {
            ...data.clock,
            soundEnabled: data.clock?.soundEnabled ?? true,
          },
          players,
          tables,
          history: data.history || [],
          payouts: data.payouts && data.payouts.length > 0 ? data.payouts : this.calculatePayouts(settings, players)
        };
        this.reconcileTableSeats();
        this.clearTableUndoStack();
        this.hasLoadedFromServer = true;
        this.lastServerModified = data.meta?.lastModified ?? Date.now();
        this.startServerSync();
        // Setup clock sync
        if (this.state.clock.isRunning) {
          this.startTimerInternal();
        }
        this.notify();
      }
    } catch (e) {
      console.error("Failed to load tournament data from backend", e);
    }
  }

  // Reset database
  public async reset() {
    try {
      const res = await fetch(localApi("/api/reset"), { method: "POST" });
      const resData = await res.json();
      if (resData.success && resData.data) {
        const data = resData.data;
        const settings = this.normalizeLoadedSettings(data.settings);
        this.state = {
          settings,
          clock: {
            ...data.clock,
            soundEnabled: data.clock?.soundEnabled ?? true,
          },
          players: data.players,
          tables: data.tables,
          history: data.history || [],
          payouts: data.payouts && data.payouts.length > 0 ? data.payouts : this.calculatePayouts(settings, data.players)
        };
        this.reconcileTableSeats();
        this.stopTimerInternal();
        this.clearTableUndoStack();
        this.hasLoadedFromServer = true;
        this.lastServerModified = data.meta?.lastModified ?? Date.now();
        this.startServerSync();
        this.emit();
      }
    } catch (e) {
      console.error("Failed to reset database", e);
    }
  }

  // Payout calculation
  public calculatePayouts(settings: TournamentSettings, players: Player[]): PayoutStructure[] {
    const baseEntries = players.length || 100;
    const totalReentries = players.reduce((sum, p) => sum + (p.reentries || 0), 0);
    const totalRebuys = players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
    const totalAddons = players.reduce((sum, p) => sum + (p.addons || 0), 0);
    const totalEntriesCount = baseEntries + totalReentries;
    const calculatedPrizePool = (totalEntriesCount + totalRebuys + totalAddons) * settings.buyIn;
    const prizePool = settings.customPrizePool !== undefined && settings.customPrizePool !== null ? settings.customPrizePool : calculatedPrizePool;
    
    // Fixed to 12 as requested by user
    const placesPaid = 12;
    const percentages = [
      30.0, 19.0, 13.5, 9.5, 7.0, 5.5, 4.2, 3.2, 2.5, 2.1, 1.8, 1.7
    ];

    const finalPayouts: PayoutStructure[] = [];
    for (let i = 0; i < placesPaid; i++) {
      const pct = percentages[i];
      finalPayouts.push({
        rank: i + 1,
        percentage: pct,
        amount: Math.round((prizePool * (pct / 100)) / 50) * 50 // round to nearest 50
      });
    }

    return finalPayouts;
  }

  // Helper to dynamically update amount values of existing payouts when prize pool changes,
  // without losing custom payout ranks/percentages.
  public updatePayoutAmounts(settings: TournamentSettings, players: Player[], currentPayouts: PayoutStructure[]): PayoutStructure[] {
    const baseEntries = players.length || 100;
    const totalReentries = players.reduce((sum, p) => sum + (p.reentries || 0), 0);
    const totalRebuys = players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
    const totalAddons = players.reduce((sum, p) => sum + (p.addons || 0), 0);
    const totalEntriesCount = baseEntries + totalReentries;
    const calculatedPrizePool = (totalEntriesCount + totalRebuys + totalAddons) * settings.buyIn;
    const prizePool = settings.customPrizePool !== undefined && settings.customPrizePool !== null ? settings.customPrizePool : calculatedPrizePool;

    return currentPayouts.map(p => ({
      ...p,
      amount: Math.round((prizePool * (p.percentage / 100)) / 50) * 50 // round to nearest 50
    }));
  }

  // --- Clock Methods ---
  public startTimer() {
    if (this.state.clock.isRunning) return;
    this.state.clock.isRunning = true;
    this.startTimerInternal();
    this.addLog('clock', 'Tournament clock started');
    this.emit();
  }

  private startTimerInternal() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      this.tick();
    }, 1000);
  }

  public pauseTimer() {
    if (!this.state.clock.isRunning) return;
    this.state.clock.isRunning = false;
    this.stopTimerInternal();
    this.addLog('clock', 'Tournament clock paused');
    this.emit();
  }

  private stopTimerInternal() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private tick() {
    let { timeRemaining, currentLevelIndex, elapsedTime } = this.state.clock;
    const structure = this.state.settings.blindStructure;
    let levelChanged = false;
    
    if (timeRemaining > 0) {
      timeRemaining--;
      elapsedTime++;
      this.state.clock.timeRemaining = timeRemaining;
      this.state.clock.elapsedTime = elapsedTime;
      
      // Play sound alerts at specific seconds
      if (this.state.clock.soundEnabled) {
        if (timeRemaining === 60) {
          this.playStrongBeepSound();
        } else if (timeRemaining <= 10 && timeRemaining >= 1) {
          this.playBeepSound(800, 0.15);
        } else if (timeRemaining === 0) {
          this.playLevelUpSound();
        }
      }
    } else {
      levelChanged = true;
      // Level complete! Go to next level
      if (currentLevelIndex < structure.length - 1) {
        currentLevelIndex++;
        const nextLevel = structure[currentLevelIndex];
        timeRemaining = nextLevel.duration * 60;
        this.state.clock.currentLevelIndex = currentLevelIndex;
        this.state.clock.timeRemaining = timeRemaining;
        
        const desc = nextLevel.isBreak 
          ? `Break started: ${nextLevel.duration} min` 
          : `Level ${nextLevel.level} started: Blinds ${nextLevel.smallBlind.toLocaleString()}/${nextLevel.bigBlind.toLocaleString()}`;
        this.addLog('level', desc);
      } else {
        // End of tournament levels
        this.state.clock.isRunning = false;
        this.stopTimerInternal();
        this.addLog('level', 'Tournament structure completed');
      }
    }

    if (levelChanged) {
      this.emit();
    } else {
      this.emitDebounced();
    }
  }

  public adjustTime(seconds: number) {
    let newTime = this.state.clock.timeRemaining + seconds;
    if (newTime < 0) newTime = 0;
    this.state.clock.timeRemaining = newTime;
    const direction = seconds >= 0 ? "added" : "removed";
    this.addLog('clock', `Clock time ${direction}: ${Math.abs(seconds)} seconds`);
    this.emit();
  }

  public setLevel(index: number) {
    const structure = this.state.settings.blindStructure;
    if (index >= 0 && index < structure.length) {
      this.state.clock.currentLevelIndex = index;
      this.state.clock.timeRemaining = structure[index].duration * 60;
      this.addLog('level', `Level manually changed to Level ${structure[index].isBreak ? 'Break' : structure[index].level}`);
      this.emit();
    }
  }

  public toggleSound() {
    this.state.clock = {
      ...this.state.clock,
      soundEnabled: !this.state.clock.soundEnabled,
    };
    this.addLog('settings', `Clock sound ${this.state.clock.soundEnabled ? 'enabled' : 'disabled'}`);
    this.emit();
  }

  // --- Players Management ---
  public registerPlayer(playerData: Omit<Player, 'id' | 'status' | 'chips' | 'tableId' | 'seatIndex' | 'reentries' | 'rebuys' | 'addons' | 'eliminationOrder' | 'registeredAt'>) {
    const newPlayer: Player = {
      ...playerData,
      id: `player-${Date.now()}`,
      status: 'Registered',
      chips: this.state.settings.startingStack,
      tableId: null,
      seatIndex: null,
      reentries: 0,
      rebuys: 0,
      addons: 0,
      eliminationOrder: null,
      registeredAt: new Date().toISOString()
    };

    this.state = {
      ...this.state,
      players: [...this.state.players, newPlayer],
      payouts: this.state.payouts && this.state.payouts.length > 0
        ? this.updatePayoutAmounts(this.state.settings, [...this.state.players, newPlayer], this.state.payouts)
        : this.calculatePayouts(this.state.settings, [...this.state.players, newPlayer]),
    };

    this.addLog('registration', `Registered: ${playerData.firstName} ${playerData.lastName}`);
    this.emit();
  }

  public getWaitingListPlayers(): Player[] {
    return this.state.players.filter((player) => {
      if (
        player.status !== 'Waiting'
        && player.status !== 'Registered'
        && player.status !== 'Re-entry'
      ) {
        return false;
      }

      return !this.isPlayerSeated(player.id) && !player.tableId;
    });
  }

  public updatePlayer(id: string, updates: Partial<Player>) {
    const pIndex = this.state.players.findIndex(p => p.id === id);
    if (pIndex !== -1) {
      const oldPlayer = this.state.players[pIndex];
      this.state.players[pIndex] = { ...oldPlayer, ...updates };
      this.addLog('move', `Updated details for ${oldPlayer.firstName} ${oldPlayer.lastName}`);
      this.emit();
    }
  }

  public deletePlayer(id: string) {
    const player = this.state.players.find(p => p.id === id);
    if (!player) return;

    this.pushTableUndoSnapshot();

    const playerName = `${player.firstName} ${player.lastName}`;

    this.state = {
      ...this.state,
      players: this.state.players.filter(p => p.id !== id),
      tables: this.state.tables.map(table => ({
        ...table,
        seats: table.seats.map(seatId => (seatId === id ? null : seatId)),
      })),
    };

    this.syncSeatsAfterPlayerChange();
    this.state.payouts = this.state.payouts && this.state.payouts.length > 0
      ? this.updatePayoutAmounts(this.state.settings, this.state.players, this.state.payouts)
      : this.calculatePayouts(this.state.settings, this.state.players);

    this.addLog('move', `Removed player from tournament: ${playerName}`, id, playerName);
    this.emit();
  }

  // Player Actions: Bust, Rebuy, Re-entry, Add-on, Disqualify
  public bustPlayer(id: string) {
    const player = this.state.players.find(p => p.id === id);
    if (!player || player.status === 'Eliminated') return;

    const isSeated = this.isPlayerSeated(id);
    const canBust =
      player.status === 'Playing'
      || player.status === 'Waiting'
      || player.status === 'Registered'
      || player.status === 'Re-entry'
      || isSeated;
    if (!canBust) return;

    const playingPlayers = this.state.players.filter(p => p.status === 'Playing' || p.status === 'Waiting');
    const elimOrder = playingPlayers.length;

    const updatedPlayers = this.state.players.map(p =>
      p.id === id
        ? {
            ...p,
            status: 'Eliminated' as Player['status'],
            chips: 0,
            eliminationOrder: elimOrder,
            tableId: null,
            seatIndex: null,
          }
        : { ...p }
    );

    const updatedTables = this.state.tables.map(table => ({
      ...table,
      seats: table.seats.map(seatId => (seatId === id ? null : seatId)),
    }));

    this.state = {
      ...this.state,
      players: updatedPlayers,
      tables: updatedTables,
    };

    this.syncSeatsAfterPlayerChange();
    this.addLog('bust', `${player.firstName} ${player.lastName} eliminated`, id);
    this.emit();
  }

  public rebuyPlayer(id: string) {
    const player = this.state.players.find(p => p.id === id);
    if (player) {
      player.rebuys += 1;
      player.chips += this.state.settings.rebuyChips;
      this.addLog('rebuy', `Rebuy for ${player.firstName} ${player.lastName}`, player.id);
      this.emit();
    }
  }

  public reentryPlayer(id: string) {
    const player = this.state.players.find(p => p.id === id);
    if (player && player.status === 'Eliminated') {
      player.status = 'Waiting'; // Returns to waiting list
      player.chips = this.state.settings.startingStack;
      player.reentries += 1;
      player.eliminationOrder = null;
      player.tableId = null;
      player.seatIndex = null;
      this.addLog('reentry', `Re-entry: ${player.firstName} ${player.lastName}`, player.id);
      this.emit();
    }
  }

  public addonPlayer(id: string) {
    const player = this.state.players.find(p => p.id === id);
    if (player && (player.status === 'Playing' || player.status === 'Waiting')) {
      player.addons += 1;
      player.chips += this.state.settings.addonChips;
      this.addLog('addon', `Add-on: ${player.firstName} ${player.lastName}`, player.id);
      this.emit();
    }
  }

  public disqualifyPlayer(id: string) {
    const player = this.state.players.find(p => p.id === id);
    if (!player) return;

    const updatedPlayers = this.state.players.map(p =>
      p.id === id
        ? {
            ...p,
            status: 'Eliminated' as Player['status'],
            chips: 0,
            tableId: null,
            seatIndex: null,
          }
        : { ...p }
    );

    const updatedTables = this.state.tables.map(table => ({
      ...table,
      seats: table.seats.map(seatId => (seatId === id ? null : seatId)),
    }));

    this.state = {
      ...this.state,
      players: updatedPlayers,
      tables: updatedTables,
    };

    this.syncSeatsAfterPlayerChange();
    this.addLog('disqualify', `${player.firstName} ${player.lastName} disqualified`, id);
    this.emit();
  }

  // --- Table undo stack ---
  private createTableUndoSnapshot(): TableUndoSnapshot {
    return {
      players: this.state.players.map(player => ({ ...player })),
      tables: this.state.tables.map(table => ({ ...table, seats: [...table.seats] })),
      payouts: this.state.payouts.map(payout => ({ ...payout })),
      history: this.state.history.map(event => ({ ...event })),
    };
  }

  private pushTableUndoSnapshot() {
    if (this.isApplyingTableUndo) return;

    this.tableUndoStack.push(this.createTableUndoSnapshot());
    if (this.tableUndoStack.length > MAX_TABLE_UNDO_STACK) {
      this.tableUndoStack.shift();
    }
  }

  private clearTableUndoStack() {
    this.tableUndoStack = [];
  }

  public getTableUndoStackSize(): number {
    return this.tableUndoStack.length;
  }

  public undoTableAction() {
    const snapshot = this.tableUndoStack.pop();
    if (!snapshot) return;

    this.isApplyingTableUndo = true;
    this.state = {
      ...this.state,
      players: snapshot.players.map(player => ({ ...player })),
      tables: snapshot.tables.map(table => ({ ...table, seats: [...table.seats] })),
      payouts: snapshot.payouts.map(payout => ({ ...payout })),
      history: snapshot.history.map(event => ({ ...event })),
    };
    this.isApplyingTableUndo = false;
    this.emit();
  }

  // --- Table Manager & Waiting List ---
  public createTable() {
    const nextNum = this.state.tables.length > 0 
      ? Math.max(...this.state.tables.map(t => t.number)) + 1 
      : 1;

    this.pushTableUndoSnapshot();

    const newTable: Table = {
      id: `table-${Date.now()}`,
      number: nextNum,
      dealerSeatIndex: 0,
      seats: Array(10).fill(null)
    };
    this.state.tables.push(newTable);
    this.addLog('balance', `Created Table ${nextNum}`);
    this.emit();
  }

  public deleteTable(tableId: string) {
    const table = this.state.tables.find(t => t.id === tableId);
    if (table) {
      this.pushTableUndoSnapshot();

      // Unseat all players at this table back to waiting list
      table.seats.forEach(pId => {
        if (pId) {
          const p = this.state.players.find(pl => pl.id === pId);
          if (p) {
            p.tableId = null;
            p.seatIndex = null;
            p.status = 'Waiting';
          }
        }
      });
      this.state.tables = this.state.tables.filter(t => t.id !== tableId);
      this.addLog('balance', `Deleted Table ${table.number}`);
      this.emit();
    }
  }

  public closeEmptyTables() {
    const emptyTables = this.state.tables.filter(t => t.seats.every(s => s === null));
    if (emptyTables.length > 0) {
      this.pushTableUndoSnapshot();

      emptyTables.forEach(et => {
        this.state.tables = this.state.tables.filter(t => t.id !== et.id);
        this.addLog('balance', `Closed Empty Table ${et.number}`);
      });
      this.emit();
    }
  }

  // Seating and Moving
  public seatPlayer(playerId: string, tableId: string, seatIndex: number) {
    const player = this.state.players.find(p => p.id === playerId);
    const table = this.state.tables.find(t => t.id === tableId);

    if (!player || !table || seatIndex < 0 || seatIndex >= 10) return;

    this.pushTableUndoSnapshot();

    const existingPlayerId = table.seats[seatIndex];

    let updatedTables = this.state.tables.map(t => ({
      ...t,
      seats: t.seats.map(seatId => (seatId === playerId ? null : seatId)),
    }));

    updatedTables = updatedTables.map(t =>
      t.id === tableId
        ? { ...t, seats: t.seats.map((seatId, idx) => (idx === seatIndex ? playerId : seatId)) }
        : t
    );

    const updatedPlayers = this.state.players.map(p => {
      if (p.id === playerId) {
        return {
          ...p,
          tableId,
          seatIndex,
          status: 'Playing' as Player['status'],
        };
      }
      if (existingPlayerId && existingPlayerId !== playerId && p.id === existingPlayerId) {
        return {
          ...p,
          tableId: null,
          seatIndex: null,
          status: 'Waiting' as Player['status'],
        };
      }
      return { ...p };
    });

    this.state = {
      ...this.state,
      players: updatedPlayers,
      tables: updatedTables,
    };

    const wasSeatedElsewhere = player.tableId && (player.tableId !== tableId || player.seatIndex !== seatIndex);
    const logMessage = wasSeatedElsewhere
      ? `Moved ${player.firstName} ${player.lastName} to Table ${table.number}, Seat ${seatIndex + 1}`
      : `Seated ${player.firstName} ${player.lastName} at Table ${table.number}, Seat ${seatIndex + 1}`;

    this.addLog(wasSeatedElsewhere ? 'move' : 'seating', logMessage);
    this.emit();
  }

  public unseatPlayer(playerId: string) {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.tableId || player.seatIndex === null) return;

    this.pushTableUndoSnapshot();

    const updatedTables = this.state.tables.map(table => ({
      ...table,
      seats: table.seats.map(seatId => (seatId === playerId ? null : seatId)),
    }));

    const updatedPlayers = this.state.players.map(p =>
      p.id === playerId
        ? { ...p, tableId: null, seatIndex: null, status: 'Waiting' as Player['status'] }
        : { ...p }
    );

    this.state = {
      ...this.state,
      players: updatedPlayers,
      tables: updatedTables,
    };

    this.syncSeatsAfterPlayerChange();
    this.addLog('move', `Moved ${player.firstName} ${player.lastName} to Waiting List`);
    this.emit();
  }

  public isPlayerSeated(playerId: string): boolean {
    return this.state.tables.some(table => table.seats.includes(playerId));
  }

  private syncSeatsAfterPlayerChange() {
    this.reconcileTableSeats();
  }

  private reconcileTableSeats() {
    let changed = false;

    const playerIds = new Set(this.state.players.map(player => player.id));

    const updatedTables = this.state.tables.map(table => ({
      ...table,
      seats: table.seats.map(seatId => {
        if (!seatId) return null;
        if (!playerIds.has(seatId)) {
          changed = true;
          return null;
        }
        const seatedPlayer = this.state.players.find(p => p.id === seatId);
        if (!seatedPlayer || seatedPlayer.status === 'Eliminated') {
          changed = true;
          return null;
        }
        return seatId;
      }),
    }));

    const updatedPlayers = this.state.players.map(player => {
      const seatedAt = this.isPlayerSeatedOnTables(player.id, updatedTables);
      if (player.status === 'Eliminated' && (player.tableId || player.seatIndex !== null)) {
        changed = true;
        return { ...player, tableId: null, seatIndex: null };
      }
      if (!seatedAt && player.tableId) {
        changed = true;
        return { ...player, tableId: null, seatIndex: null };
      }
      return { ...player };
    });

    if (changed) {
      this.state = {
        ...this.state,
        players: updatedPlayers,
        tables: updatedTables,
      };
    }
  }

  private isPlayerSeatedOnTables(playerId: string, tables: Table[]): boolean {
    return tables.some(table => table.seats.includes(playerId));
  }

  private clearPlayerFromTables(playerId: string) {
    this.state.tables.forEach(table => {
      for (let i = 0; i < table.seats.length; i++) {
        if (table.seats[i] === playerId) {
          table.seats[i] = null;
        }
      }
    });

    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.tableId = null;
      player.seatIndex = null;
    }
  }

  private unseatPlayerInternal(playerId: string, tableId: string, seatIndex: number) {
    const table = this.state.tables.find(t => t.id === tableId);
    if (table && table.seats[seatIndex] === playerId) {
      table.seats[seatIndex] = null;
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.tableId = null;
      player.seatIndex = null;
    }
  }

  public swapPlayers(player1Id: string, player2Id: string) {
    const p1 = this.state.players.find(p => p.id === player1Id);
    const p2 = this.state.players.find(p => p.id === player2Id);
    
    if (p1 && p2 && p1.tableId && p1.seatIndex !== null && p2.tableId && p2.seatIndex !== null) {
      const t1 = this.state.tables.find(t => t.id === p1.tableId);
      const t2 = this.state.tables.find(t => t.id === p2.tableId);
      
      if (t1 && t2) {
        this.pushTableUndoSnapshot();

        const s1 = p1.seatIndex;
        const s2 = p2.seatIndex;
        
        t1.seats[s1] = p2.id;
        t2.seats[s2] = p1.id;
        
        p1.tableId = t2.id;
        p1.seatIndex = s2;
        p2.tableId = t1.id;
        p2.seatIndex = s1;
        
        this.addLog('move', `Swapped ${p1.firstName} and ${p2.firstName}`);
        this.emit();
      }
    }
  }

  public moveDealerButton(tableId: string, seatIndex: number) {
    const table = this.state.tables.find(t => t.id === tableId);
    if (table && seatIndex >= 0 && seatIndex < 10) {
      table.dealerSeatIndex = seatIndex;
      this.emit();
    }
  }

  // Auto Seating
  public autoSeatAll() {
    const waitingPlayers = this.getWaitingListPlayers();
    if (waitingPlayers.length === 0) return;

    const hasEmptySeat = this.state.tables.some(table => table.seats.includes(null));
    if (!hasEmptySeat) return;

    this.pushTableUndoSnapshot();

    let seatedCount = 0;
    for (const player of waitingPlayers) {
      let seated = false;
      // Search for first empty seat
      for (const table of this.state.tables) {
        const emptySeatIdx = table.seats.indexOf(null);
        if (emptySeatIdx !== -1) {
          table.seats[emptySeatIdx] = player.id;
          player.tableId = table.id;
          player.seatIndex = emptySeatIdx;
          player.status = 'Playing';
          seated = true;
          seatedCount++;
          break;
        }
      }
      if (!seated) break; // All tables full!
    }

    if (seatedCount > 0) {
      this.addLog('balance', `Auto-seated ${seatedCount} players`);
      this.emit();
    } else {
      this.tableUndoStack.pop();
    }
  }

  // Automatic Table Balancing
  public balanceTables() {
    const activeTables = this.state.tables;
    if (activeTables.length < 2) return;

    // Get table occupancy lists
    const tableOccupancy = activeTables.map(t => {
      const playersAtTable = t.seats.filter(s => s !== null).length;
      return { tableId: t.id, number: t.number, count: playersAtTable, seats: t.seats };
    });

    // Find table with max and min occupancy
    let maxTable = tableOccupancy.reduce((prev, curr) => prev.count > curr.count ? prev : curr);
    let minTable = tableOccupancy.reduce((prev, curr) => prev.count < curr.count ? prev : curr);

    // If difference is greater than 1, move a player
    if (maxTable.count - minTable.count > 1) {
      const sourceTable = this.state.tables.find(t => t.id === maxTable.tableId)!;
      const destTable = this.state.tables.find(t => t.id === minTable.tableId)!;

      // Find a player to move (from highest seat index or dealer relative)
      let playerToMoveId: string | null = null;
      let sourceSeatIdx = -1;
      for (let i = 9; i >= 0; i--) {
        if (sourceTable.seats[i] !== null) {
          playerToMoveId = sourceTable.seats[i];
          sourceSeatIdx = i;
          break;
        }
      }

      if (playerToMoveId && sourceSeatIdx !== -1) {
        const player = this.state.players.find(p => p.id === playerToMoveId)!;
        const destSeatIdx = destTable.seats.indexOf(null);

        if (destSeatIdx !== -1) {
          this.pushTableUndoSnapshot();

          // Perform move
          sourceTable.seats[sourceSeatIdx] = null;
          destTable.seats[destSeatIdx] = playerToMoveId;

          player.tableId = destTable.id;
          player.seatIndex = destSeatIdx;

          this.addLog('balance', `Balanced tables: Moved ${player.firstName} from Table ${sourceTable.number} to Table ${destTable.number}`);
          this.emit();
          
          // Re-balance recursively in case of massive imbalance
          setTimeout(() => this.balanceTables(), 100);
        }
      }
    }
  }

  // --- Settings Methods ---
  public updateSettings(updates: Partial<TournamentSettings>) {
    this.state.settings = { ...this.state.settings, ...updates };
    this.state.payouts = this.state.payouts && this.state.payouts.length > 0
      ? this.updatePayoutAmounts(this.state.settings, this.state.players, this.state.payouts)
      : this.calculatePayouts(this.state.settings, this.state.players);
    this.addLog('settings', `Tournament settings updated: ${updates.name || 'general config'}`);
    this.emit();
  }

  public updateSettingsAndPayouts(settingsUpdates: Partial<TournamentSettings>, newPayouts: PayoutStructure[]) {
    this.state.settings = { ...this.state.settings, ...settingsUpdates };
    this.state.payouts = newPayouts;
    this.addLog('settings', 'Tournament settings and payout structure updated');
    this.emit();
  }

  public updateBlindStructure(newStructure: BlindLevel[], source?: string) {
    this.state.settings.blindStructure = newStructure;
    const label = source ? `Blind structure updated (${source})` : `Blind structure updated (${newStructure.length} entries)`;
    this.addLog('settings', label);
    this.emit();
  }

  public updatePayouts(newPayouts: PayoutStructure[]) {
    this.state.payouts = newPayouts;
    this.addLog('settings', 'Payout structure manually updated');
    this.emit();
  }

  public logActivity(
    type: HistoryEvent['type'],
    description: string,
    playerId?: string,
    explicitPlayerName?: string,
  ) {
    this.addLog(type, description, playerId, explicitPlayerName);
    this.emit();
  }

  // --- Log / History Methods ---
  public addLog(
    type: HistoryEvent['type'],
    description: string,
    playerId?: string,
    explicitPlayerName?: string,
  ) {
    const player = playerId ? this.state.players.find(p => p.id === playerId) : undefined;
    const newEvent: HistoryEvent = {
      id: `h-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      type,
      playerId,
      playerName: explicitPlayerName ?? (player ? `${player.firstName} ${player.lastName}` : undefined),
      description
    };
    
    // Add to top of list (keep full tournament audit trail)
    this.state.history.unshift(newEvent);
    if (this.state.history.length > 10000) {
      this.state.history.pop();
    }
  }

  public undoLastHistory() {
    if (this.state.history.length === 0) return;
    const undone = this.state.history.shift(); // Remove latest
    if (undone) {
      this.addLog('undo', `Undid action: "${undone.description}"`);
      this.emit();
    }
  }

  // --- Sound Synthesizers (Browser Audio Context) ---
  private playBeepSound(frequency: number, duration: number) {
    if (!this.state.clock.soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("AudioContext block by browser policy or missing context", e);
    }
  }

  private playLevelUpSound() {
    if (!this.state.clock.soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      
      // Dual tone gong/bell sound
      const tones = [523.25, 659.25, 783.99]; // C5, E5, G5
      tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
        
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.1 + 1.2);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime + idx * 0.1);
        osc.stop(ctx.currentTime + idx * 0.1 + 1.2);
      });
    } catch (e) {
      console.warn("AudioContext error playing level up", e);
    }
  }

  private playStrongBeepSound() {
    if (!this.state.clock.soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(800, ctx.currentTime);
      
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(805, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.8);
      osc2.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.warn("AudioContext error playing strong beep", e);
    }
  }
}

export const tournamentStore = new Store();
