/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { tournamentStore, AppState } from './store';
import type { DealerTimerModeSetting } from './types';

export function useTournament() {
  const [state, setState] = useState<AppState>(tournamentStore.getState());

  useEffect(() => {
    // Subscribe to store updates
    const unsubscribe = tournamentStore.subscribe((newState) => {
      setState({
        ...newState,
        clock: { ...newState.clock },
        players: newState.players.map(p => ({ ...p })),
        tables: newState.tables.map(t => ({ ...t, seats: [...t.seats] })),
        history: [...newState.history],
      });
    });
    
    return unsubscribe;
  }, []);

  return {
    state,
    // Clock methods
    startTimer: () => tournamentStore.startTimer(),
    pauseTimer: () => tournamentStore.pauseTimer(),
    adjustTime: (seconds: number) => tournamentStore.adjustTime(seconds),
    setLevel: (idx: number) => tournamentStore.setLevel(idx),
    toggleSound: () => tournamentStore.toggleSound(),
    
    // Players management
    registerPlayer: (data: any) => tournamentStore.registerPlayer(data),
    updatePlayer: (id: string, updates: any) => tournamentStore.updatePlayer(id, updates),
    deletePlayer: (id: string) => tournamentStore.deletePlayer(id),
    
    // Player Actions during live games
    bustPlayer: (id: string) => tournamentStore.bustPlayer(id),
    rebuyPlayer: (id: string) => tournamentStore.rebuyPlayer(id),
    reentryPlayer: (id: string) => tournamentStore.reentryPlayer(id),
    addonPlayer: (id: string) => tournamentStore.addonPlayer(id),
    disqualifyPlayer: (id: string) => tournamentStore.disqualifyPlayer(id),
    
    // Table management
    createTable: () => tournamentStore.createTable(),
    deleteTable: (id: string) => tournamentStore.deleteTable(id),
    closeEmptyTables: () => tournamentStore.closeEmptyTables(),
    seatPlayer: (pId: string, tId: string, sIdx: number) => tournamentStore.seatPlayer(pId, tId, sIdx),
    unseatPlayer: (pId: string) => tournamentStore.unseatPlayer(pId),
    swapPlayers: (p1Id: string, p2Id: string) => tournamentStore.swapPlayers(p1Id, p2Id),
    moveDealerButton: (tId: string, sIdx: number) => tournamentStore.moveDealerButton(tId, sIdx),
    autoSeatAll: () => tournamentStore.autoSeatAll(),
    balanceTables: () => tournamentStore.balanceTables(),
    
    // Tournament Settings
    updateSettings: (updates: any) => tournamentStore.updateSettings(updates),
    updateSettingsAndPayouts: (updates: any, payouts: any) => tournamentStore.updateSettingsAndPayouts(updates, payouts),
    updateBlindStructure: (structure: any, source?: string) => tournamentStore.updateBlindStructure(structure, source),
    updatePayouts: (payouts: any) => tournamentStore.updatePayouts(payouts),
    
    // Utility / Logs
    undoLastHistory: () => tournamentStore.undoLastHistory(),
    undoTableAction: () => tournamentStore.undoTableAction(),
    undoTableActions: (selectedIds: string[]) => tournamentStore.undoTableActions(selectedIds),
    getTableUndoCount: () => tournamentStore.getTableUndoStackSize(),
    getTableUndoEntries: () => tournamentStore.getTableUndoEntries(),
    getWaitingListPlayers: () => tournamentStore.getWaitingListPlayers(),
    saveFloorTeams: (teams: Parameters<typeof tournamentStore.saveFloorTeams>[0]) =>
      tournamentStore.saveFloorTeams(teams),
    saveDealerZones: (zones: Parameters<typeof tournamentStore.saveDealerZones>[0]) =>
      tournamentStore.saveDealerZones(zones),
    saveDealerTimers: (
      timerMode: DealerTimerModeSetting,
      callTimeSeconds: number,
      playerTimeSeconds: number,
    ) => tournamentStore.saveDealerTimers(timerMode, callTimeSeconds, playerTimeSeconds),
    resetDatabase: () => tournamentStore.reset(),
    importTournamentBackup: (payload: unknown) => tournamentStore.importTournamentBackup(payload),
  };
}
