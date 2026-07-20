/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTournament } from "../useTournament";
import { Plus, Trash2, Save, RotateCcw, Sliders, PlayCircle, PlusCircle, Upload, Download, ShieldAlert, X } from "lucide-react";
import { BlindLevel, TournamentType, PayoutStructure } from "../types";
import { tournamentStore } from "../store";
import { localApi } from "../config/api";
import { getCurrencyConfig, TOURNAMENT_CURRENCIES } from "../currency";
import { importBlindStructureFromFile, exportBlindStructureToExcel } from "../blindStructureImportExport";
import {
  buildTournamentBackupExport,
  downloadTournamentBackupJson,
  parseTournamentBackup,
  type TournamentBackupPayload,
} from "../tournament/tournamentBackup";
import type { TournamentDatabase } from "../server/tournamentDatabase";

export default function SettingsView() {
  const { state, updateBlindStructure, updateSettingsAndPayouts, resetDatabase, importTournamentBackup } = useTournament();
  const { settings } = state;

  const [formState, setFormState] = useState({
    ...settings,
    currency: settings.currency ?? "USD",
    lateRegLevel: settings.lateRegLevel ?? 7,
    isMultiDay: settings.isMultiDay ?? false,
    totalDays: settings.totalDays ?? 0,
    currentDay: settings.currentDay ?? 1
  });
  const [localPayouts, setLocalPayouts] = useState<PayoutStructure[]>(state.payouts || []);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("TOURNAMENT SETTINGS SAVED & PERSISTED SUCCESSFULLY!");
  const [showNewTournamentConfirm, setShowNewTournamentConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportPayload, setPendingImportPayload] = useState<TournamentBackupPayload | null>(null);
  const [pendingImportLabel, setPendingImportLabel] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const blindImportInputRef = useRef<HTMLInputElement>(null);
  const tournamentImportInputRef = useRef<HTMLInputElement>(null);

  const syncFormFromStore = useCallback(() => {
    const current = tournamentStore.getState();
    setFormState({
      ...current.settings,
      currency: current.settings.currency ?? "USD",
      lateRegLevel: current.settings.lateRegLevel ?? 7,
      isMultiDay: current.settings.isMultiDay ?? false,
      totalDays: current.settings.totalDays ?? 0,
      currentDay: current.settings.currentDay ?? 1,
    });
    setLocalPayouts(current.payouts || []);
  }, []);

  const hasTournamentData =
    state.players.length > 0
    || state.tables.length > 0
    || state.history.length > 0
    || state.clock.elapsedTime > 0
    || Boolean(state.clock.tournamentStartedAt);

  // Financial calculations helper
  const getFinancials = () => {
    const baseEntries = state.players?.length || 0;
    const totalReentries = state.players?.reduce((sum, p) => sum + (p.reentries || 0), 0) || 0;
    const totalRebuys = state.players?.reduce((sum, p) => sum + (p.rebuys || 0), 0) || 0;
    const totalAddons = state.players?.reduce((sum, p) => sum + (p.addons || 0), 0) || 0;

    const buyInAmount = formState.buyIn || 0;
    const feeAmount = formState.fee || 0;

    // Default to a realistic seed of 138 players if baseEntries is 0 (first load before DB sync)
    const effectiveBaseEntries = baseEntries === 0 ? 138 : baseEntries;
    const totalEntriesCount = effectiveBaseEntries + totalReentries;

    const entriesPrizeContribution = totalEntriesCount * buyInAmount;
    const rebuysPrizeContribution = totalRebuys * buyInAmount;
    const addonsPrizeContribution = totalAddons * buyInAmount;

    // Do NOT include the fee (fi) in the prize pool
    const calculatedPrizePool = entriesPrizeContribution + rebuysPrizeContribution + addonsPrizeContribution;
    const totalPrizePool = formState.customPrizePool !== undefined && formState.customPrizePool !== null ? formState.customPrizePool : calculatedPrizePool;
    const totalFeesCollected = totalEntriesCount * feeAmount;
    const totalCollectedRevenue = totalPrizePool + totalFeesCollected;

    // Sum up distributed prize payouts from localPayouts state
    const totalDistributedAmount = localPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalDistributedPercentage = localPayouts.reduce((sum, p) => sum + (p.percentage || 0), 0);

    const remainingToDistributeAmount = totalPrizePool - totalDistributedAmount;
    const remainingToDistributePercentage = 100 - totalDistributedPercentage;

    return {
      baseEntries: effectiveBaseEntries,
      totalReentries,
      totalEntriesCount,
      totalRebuys,
      totalAddons,
      entriesPrizeContribution,
      rebuysPrizeContribution,
      addonsPrizeContribution,
      calculatedPrizePool,
      totalPrizePool,
      totalFeesCollected,
      totalCollectedRevenue,
      buyInAmount,
      feeAmount,
      totalDistributedAmount,
      totalDistributedPercentage,
      remainingToDistributeAmount,
      remainingToDistributePercentage
    };
  };

  const financials = getFinancials();
  const prize = financials.totalPrizePool;
  const currencyConfig = getCurrencyConfig(formState.currency);

  useEffect(() => {
    if (state.payouts && state.payouts.length > 0) {
      setLocalPayouts(state.payouts);
    }
  }, [state.payouts]);

  // Dynamically scale payout amounts when prize pool changes
  useEffect(() => {
    setLocalPayouts(prev => {
      // Avoid infinite loop if values are already correct
      let changed = false;
      const next = prev.map(p => {
        const expectedAmt = Math.round((prize * (p.percentage / 100)) / 10) * 10;
        if (p.amount !== expectedAmt) {
          changed = true;
          return { ...p, amount: expectedAmt };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [prize]);

  const tournamentTypes: TournamentType[] = [
    "Freezeout",
    "Rebuy",
    "Re-entry",
    "Knockout",
    "Bounty",
    "Mystery Bounty",
    "Turbo",
    "Hyper Turbo"
  ];

  // Preset structure generator
  const applyPresetStructure = (type: "standard" | "turbo" | "hyper") => {
    let duration = 20;
    if (type === "turbo") duration = 10;
    if (type === "hyper") duration = 5;

    const standardLevels: BlindLevel[] = [
      { level: 1, smallBlind: 100, bigBlind: 200, ante: 200, duration },
      { level: 2, smallBlind: 200, bigBlind: 300, ante: 300, duration },
      { level: 3, smallBlind: 200, bigBlind: 400, ante: 400, duration },
      { level: 4, smallBlind: 300, bigBlind: 600, ante: 600, duration },
      { level: 5, smallBlind: 400, bigBlind: 800, ante: 800, duration },
      { level: 6, smallBlind: 500, bigBlind: 1000, ante: 1000, duration },
      { level: 7, smallBlind: 0, bigBlind: 0, ante: 0, duration: 15, isBreak: true },
      { level: 8, smallBlind: 600, bigBlind: 1200, ante: 1200, duration },
      { level: 9, smallBlind: 800, bigBlind: 1600, ante: 1600, duration },
      { level: 10, smallBlind: 1000, bigBlind: 2000, ante: 2000, duration },
      { level: 11, smallBlind: 1200, bigBlind: 2400, ante: 2400, duration },
      { level: 12, smallBlind: 1000, bigBlind: 2000, ante: 2000, duration },
      { level: 13, smallBlind: 1500, bigBlind: 3000, ante: 3000, duration },
      { level: 14, smallBlind: 2000, bigBlind: 4000, ante: 4000, duration },
      { level: 15, smallBlind: 0, bigBlind: 0, ante: 0, duration: 15, isBreak: true },
      { level: 16, smallBlind: 3000, bigBlind: 6000, ante: 6000, duration },
      { level: 17, smallBlind: 4000, bigBlind: 8000, ante: 8000, duration },
      { level: 18, smallBlind: 5000, bigBlind: 10000, ante: 10000, duration }
    ];

    setFormState(prev => ({
      ...prev,
      blindTime: duration,
      blindStructure: standardLevels
    }));
  };

  const handleChange = (field: keyof typeof formState, value: any) => {
    setFormState(prev => {
      const updated = { ...prev, [field]: value };
      if (field === "blindTime") {
        const oldTime = prev.blindTime;
        updated.blindStructure = prev.blindStructure.map(lvl => {
          if (!lvl.isBreak && lvl.duration === oldTime) {
            return { ...lvl, duration: value };
          }
          return lvl;
        });
      }
      return updated;
    });
  };

  const handleLevelChange = (index: number, field: keyof BlindLevel, value: any) => {
    const updatedStructure = [...formState.blindStructure];
    updatedStructure[index] = { ...updatedStructure[index], [field]: Number(value) };
    setFormState(prev => ({ ...prev, blindStructure: updatedStructure }));
  };

  const handleLevelToggleBreak = (index: number) => {
    const updatedStructure = [...formState.blindStructure];
    const item = updatedStructure[index];
    if (item.isBreak) {
      updatedStructure[index] = {
        ...item,
        isBreak: false,
        smallBlind: 100,
        bigBlind: 200,
        ante: 200
      };
    } else {
      updatedStructure[index] = {
        ...item,
        isBreak: true,
        smallBlind: 0,
        bigBlind: 0,
        ante: 0,
        duration: formState.breakTime
      };
    }
    setFormState(prev => ({ ...prev, blindStructure: updatedStructure }));
  };

  const addBlindLevel = () => {
    const structure = formState.blindStructure;
    const lastLevelNum = structure.filter(l => !l.isBreak).length;
    const lastLevel = structure[structure.length - 1] || { smallBlind: 100, bigBlind: 200, ante: 200, duration: 20 };
    
    const newLevel: BlindLevel = {
      level: lastLevelNum + 1,
      smallBlind: lastLevel.smallBlind * 1.5,
      bigBlind: lastLevel.bigBlind * 1.5,
      ante: lastLevel.bigBlind * 1.5,
      duration: formState.blindTime
    };

    setFormState(prev => ({
      ...prev,
      blindStructure: [...prev.blindStructure, newLevel]
    }));
  };

  const removeBlindLevel = (index: number) => {
    const updatedStructure = formState.blindStructure.filter((_, i) => i !== index);
    // Recalculate levels sequence numbers for non-breaks
    let lvlSeq = 1;
    const finalStructure = updatedStructure.map(item => {
      if (item.isBreak) return item;
      const updated = { ...item, level: lvlSeq };
      lvlSeq++;
      return updated;
    });

    setFormState(prev => ({ ...prev, blindStructure: finalStructure }));
  };

  const handleExportTournamentBackup = async () => {
    setBackupBusy(true);
    try {
      const response = await fetch(localApi("/api/data"));
      if (!response.ok) {
        throw new Error("Could not read tournament data from server.");
      }
      const data = await response.json() as TournamentDatabase;
      downloadTournamentBackupJson(buildTournamentBackupExport(data));
      tournamentStore.logActivity("settings", `Exported full tournament backup (${data.settings.name || data.settings.id})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      alert(message);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleTournamentImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const raw = JSON.parse(String(loadEvent.target?.result ?? ""));
        const parsed = parseTournamentBackup(raw);
        if (parsed.ok === false) {
          alert(parsed.error);
          return;
        }

        const backup: TournamentBackupPayload = {
          backupVersion: typeof raw.backupVersion === "number" ? raw.backupVersion : 1,
          exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
          settings: parsed.data.settings,
          clock: parsed.data.clock,
          players: parsed.data.players,
          tables: parsed.data.tables,
          history: parsed.data.history,
          payouts: parsed.data.payouts,
          floorCalls: parsed.data.floorCalls,
          dealerRotation: parsed.data.dealerRotation,
        };

        setPendingImportPayload(backup);
        setPendingImportLabel(backup.settings.name || backup.settings.id || file.name);
        setShowImportConfirm(true);
      } catch {
        alert("Could not parse tournament backup JSON.");
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!pendingImportPayload) return;

    setBackupBusy(true);
    try {
      await importTournamentBackup(pendingImportPayload);
      syncFormFromStore();
      setShowImportConfirm(false);
      setPendingImportPayload(null);
      setPendingImportLabel("");
      setToastMessage("TOURNAMENT BACKUP IMPORTED SUCCESSFULLY!");
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      alert(message);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleConfirmNewTournament = async () => {
    setBackupBusy(true);
    try {
      await resetDatabase();
      syncFormFromStore();
      setShowNewTournamentConfirm(false);
      setToastMessage("NEW TOURNAMENT STARTED — PLAYERS, TABLES, CLOCK, AND HISTORY CLEARED.");
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start a new tournament.";
      alert(message);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleSave = () => {
    updateSettingsAndPayouts(formState, localPayouts);
    setToastMessage("TOURNAMENT SETTINGS SAVED & PERSISTED SUCCESSFULLY!");
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const handleImportBlindStructure = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedStructure = await importBlindStructureFromFile(file);
      setFormState((prev) => ({ ...prev, blindStructure: importedStructure }));
      updateBlindStructure(importedStructure, `imported from ${file.name}`);
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      alert(`Blind structure import failed: ${message}`);
    } finally {
      event.target.value = "";
    }
  };

  const handleExportBlindStructure = () => {
    exportBlindStructureToExcel(formState.blindStructure, formState.name || formState.id);
    tournamentStore.logActivity("settings", `Exported blind structure (${formState.blindStructure.length} entries)`);
  };

  return (
    <div className="bg-zinc-950 text-zinc-100 p-6 min-h-screen">
      {/* Toast Notification */}
      {showSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-black px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/10 flex items-center gap-2 animate-bounce max-w-md">
          <span>✓</span> {toastMessage}
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Title */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wider">TOURNAMENT CONFIGURATION</h1>
            <p className="text-zinc-400 text-xs mt-1">Configure blind timelines, buy-ins, fees, chip counts, and structure templates.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              ref={tournamentImportInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleTournamentImportFile}
            />
            <button
              type="button"
              disabled={backupBusy}
              onClick={() => tournamentImportInputRef.current?.click()}
              className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-650 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 text-zinc-100 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" /> Import JSON
            </button>
            <button
              type="button"
              disabled={backupBusy}
              onClick={() => void handleExportTournamentBackup()}
              className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-650 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 text-zinc-100 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
            <button
              type="button"
              disabled={backupBusy}
              onClick={() => setShowNewTournamentConfirm(true)}
              className="px-4 py-2.5 bg-red-950/80 border border-red-500/40 hover:border-red-400/70 text-red-200 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> New Tournament
            </button>
            <button 
              onClick={handleSave}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black transition flex items-center gap-1.5 uppercase tracking-wider shadow-lg shadow-emerald-500/10"
            >
              <Save className="w-3.5 h-3.5 fill-current" /> Save Tournament
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* General settings (Form spans 2 columns) */}
          <div className="lg:col-span-2 space-y-6">
            
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 mb-4 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" /> Basic Details & Financial Parameters
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Tournament Name</label>
                  <input 
                    type="text" 
                    value={formState.name} 
                    onChange={(e) => handleChange("name", e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Tournament ID</label>
                  <input 
                    type="text" 
                    value={formState.id} 
                    onChange={(e) => handleChange("id", e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Prize Currency</label>
                  <select
                    value={formState.currency ?? "USD"}
                    onChange={(e) => handleChange("currency", e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    {TOURNAMENT_CURRENCIES.map((currency) => (
                      <option key={currency.code} value={currency.code} className="bg-zinc-950 text-zinc-100">
                        {currency.symbol} {currency.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Buy-in ({currencyConfig.symbol})</label>
                  <input 
                    type="number" 
                    value={formState.buyIn} 
                    onChange={(e) => handleChange("buyIn", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Fee ({currencyConfig.symbol})</label>
                  <input 
                    type="number" 
                    value={formState.fee} 
                    onChange={(e) => handleChange("fee", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Tournament Type</label>
                  <select 
                    value={formState.type} 
                    onChange={(e) => handleChange("type", e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    {tournamentTypes.map(t => (
                      <option key={t} value={t} className="bg-zinc-950 text-zinc-100">{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Starting Stack</label>
                  <input 
                    type="number" 
                    value={formState.startingStack} 
                    onChange={(e) => handleChange("startingStack", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Bonus Chips</label>
                  <input 
                    type="number" 
                    value={formState.bonusChips} 
                    onChange={(e) => handleChange("bonusChips", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Rebuy Chips</label>
                  <input 
                    type="number" 
                    value={formState.rebuyChips} 
                    onChange={(e) => handleChange("rebuyChips", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Add-on Chips</label>
                  <input 
                    type="number" 
                    value={formState.addonChips} 
                    onChange={(e) => handleChange("addonChips", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 border-t border-zinc-800 pt-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Max Players</label>
                  <input 
                    type="number" 
                    value={formState.maxPlayers} 
                    onChange={(e) => handleChange("maxPlayers", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Max Tables</label>
                  <input 
                    type="number" 
                    value={formState.maxTables} 
                    onChange={(e) => handleChange("maxTables", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Level Time (Min)</label>
                  <input 
                    type="number" 
                    value={formState.blindTime} 
                    onChange={(e) => handleChange("blindTime", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Break Time (Min)</label>
                  <input 
                    type="number" 
                    value={formState.breakTime} 
                    onChange={(e) => handleChange("breakTime", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1.5">Late Reg. Level</label>
                  <input 
                    type="number" 
                    value={formState.lateRegLevel} 
                    onChange={(e) => handleChange("lateRegLevel", Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-amber-600/30 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="7"
                    min="1"
                    max="100"
                  />
                </div>
              </div>

              {/* Multi-Day Tournament Settings Section */}
              <div className="border-t border-zinc-800/60 pt-5 mt-4 space-y-4" id="multi-day-settings-panel">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-widest text-amber-500">⏳ DAY CONFIGURATION</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Multi-Day Tournament?</label>
                    <select 
                      value={formState.isMultiDay ? "true" : "false"} 
                      onChange={(e) => {
                        const val = e.target.value === "true";
                        handleChange("isMultiDay", val);
                        if (!val) {
                          handleChange("totalDays", 0);
                        } else {
                          if (!formState.totalDays || formState.totalDays === 0) {
                            handleChange("totalDays", 2);
                          }
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-medium"
                    >
                      <option value="false">Single Day (Default)</option>
                      <option value="true">Multi-Day</option>
                    </select>
                  </div>
                  
                  {formState.isMultiDay && (
                    <>
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Total Days</label>
                        <input 
                          type="number" 
                          value={formState.totalDays} 
                          onChange={(e) => handleChange("totalDays", Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                          min="0"
                          placeholder="e.g. 3"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Active Day</label>
                        <input 
                          type="number" 
                          value={formState.currentDay} 
                          onChange={(e) => handleChange("currentDay", Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                          min="1"
                          placeholder="e.g. 1"
                        />
                      </div>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 italic mt-1">
                  * If Total Days is set to 0, day information will not be shown on the tournament clock (only LIVE will be displayed).
                </p>
              </div>
            </div>

            {/* FINANCIAL REPORT PANEL */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-4" id="financial-report-card">
              <h2 className="text-xs font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 mb-2 flex items-center gap-2">
                📊 FINANCIAL REPORT
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Entries Card */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">ENTRIES</p>
                    <p className="text-2xl font-black font-mono text-zinc-100">{financials.totalEntriesCount}</p>
                    <p className="text-[9px] text-zinc-400 mt-1">({financials.baseEntries} Entries + {financials.totalReentries} Re-entry)</p>
                  </div>
                  <div className="border-t border-zinc-900 pt-2 mt-3">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-0.5">PRIZE SHARE</p>
                    <p className="text-base font-bold font-mono text-emerald-400">${financials.entriesPrizeContribution.toLocaleString()}</p>
                  </div>
                </div>

                {/* Rebuys Card */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">REBUY / REBUYS</p>
                    <p className="text-2xl font-black font-mono text-zinc-100">{financials.totalRebuys}</p>
                    <p className="text-[9px] text-zinc-400 mt-1">Total Rebuy Count</p>
                  </div>
                  <div className="border-t border-zinc-900 pt-2 mt-3">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-0.5">PRIZE SHARE</p>
                    <p className="text-base font-bold font-mono text-emerald-400">${financials.rebuysPrizeContribution.toLocaleString()}</p>
                  </div>
                </div>

                {/* Addons Card */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">ADD-ONS</p>
                    <p className="text-2xl font-black font-mono text-zinc-100">{financials.totalAddons}</p>
                    <p className="text-[9px] text-zinc-400 mt-1">Total Add-on Count</p>
                  </div>
                  <div className="border-t border-zinc-900 pt-2 mt-3">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-0.5">PRIZE SHARE</p>
                    <p className="text-base font-bold font-mono text-emerald-400">${financials.addonsPrizeContribution.toLocaleString()}</p>
                  </div>
                </div>

                {/* Fees Card */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">RAKE (FEES)</p>
                    <p className="text-2xl font-black font-mono text-amber-500">${financials.totalFeesCollected.toLocaleString()}</p>
                    <p className="text-[9px] text-zinc-500 mt-1">House Service Fee</p>
                  </div>
                  <div className="border-t border-zinc-900 pt-2 mt-3">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-0.5">FEE PER ENTRY</p>
                    <p className="text-base font-bold font-mono text-amber-500">${financials.feeAmount.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Summary Details Row */}
              <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">GENERAL CASHIER</p>
                  <p className="text-2xl font-black font-mono text-zinc-100">${financials.totalCollectedRevenue.toLocaleString()}</p>
                </div>
                <div className="md:text-right border-l md:border-l border-zinc-800 md:pl-8">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">TOTAL PRIZE POOL</p>
                  <p className="text-2xl font-black font-mono text-emerald-400">${financials.totalPrizePool.toLocaleString()}</p>
                  <p className="text-[9px] text-zinc-400 mt-0.5">Amount to be distributed, excluding house fees.</p>
                </div>
              </div>
            </div>

            {/* PRIZE POOL PAYOUTS EDITOR */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-800 pb-2 mb-2 gap-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                  🏆 Prize Payouts
                </h2>
                <span className="text-xs font-mono text-emerald-400 font-bold">
                  Net Prize Pool: ${financials.totalPrizePool.toLocaleString()}
                </span>
              </div>
              
              <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">NET PRIZE POOL ($)</p>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={formState.customPrizePool !== undefined && formState.customPrizePool !== null ? formState.customPrizePool : Math.round(financials.totalPrizePool)}
                      onChange={(e) => {
                        const val = e.target.value === "" ? undefined : Number(e.target.value);
                        handleChange("customPrizePool", val);
                      }}
                      className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-base text-emerald-400 font-mono font-bold w-48 focus:outline-none focus:border-amber-500"
                      placeholder="Custom Prize Pool"
                    />
                    {(formState.customPrizePool !== undefined && formState.customPrizePool !== null) && (
                      <button
                        onClick={() => {
                          handleChange("customPrizePool", undefined);
                        }}
                        className="text-[10px] bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-100 text-zinc-400 px-2 py-1.5 rounded transition font-bold uppercase tracking-wider"
                        title="Return to automatic calculation"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1">
                    {formState.customPrizePool !== undefined && formState.customPrizePool !== null 
                      ? "Custom prize pool defined. Auto-calculated value: $" + (financials.calculatedPrizePool).toLocaleString()
                      : "Automatically calculated based on entries and re-entry/rebuy/add-on counts."
                    }
                  </p>
                </div>
                <div className="text-right md:border-l md:border-zinc-800 md:pl-8">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">REMAINING TO DISTRIBUTE</p>
                  <p className={`text-lg font-black font-mono transition-all ${financials.remainingToDistributeAmount === 0 ? "text-emerald-400" : financials.remainingToDistributeAmount < 0 ? "text-red-500" : "text-amber-500"}`}>
                    ${Math.round(financials.remainingToDistributeAmount).toLocaleString()} ({financials.remainingToDistributePercentage.toFixed(2)}%)
                  </p>
                </div>
              </div>

              <p className="text-xs text-zinc-400 mb-2">
                Edit payment percentages or amounts for each place. The remaining amount to distribute updates dynamically as you enter values.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                {localPayouts.map((pay, idx) => {
                  return (
                    <div key={pay.rank} className="bg-zinc-950 border border-zinc-850 rounded-xl p-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-400 min-w-[24px]">{pay.rank}.</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        <div className="flex-[1.2]">
                          <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-0.5">Percent (%)</label>
                          <input 
                            type="number" 
                            step="0.01"
                            value={pay.percentage} 
                            onChange={(e) => {
                              const pct = Number(e.target.value);
                              const amt = Math.round((prize * (pct / 100)) / 10) * 10;
                              const updated = [...localPayouts];
                              updated[idx] = { rank: pay.rank, percentage: pct, amount: amt };
                              setLocalPayouts(updated);
                            }}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-100 font-mono font-medium"
                          />
                        </div>
                        <div className="w-[64px]">
                          <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-0.5">Amount ($)</label>
                          <input 
                            type="number" 
                            value={pay.amount} 
                            onChange={(e) => {
                              const amt = Number(e.target.value);
                              const pct = prize > 0 ? Math.round((amt / prize) * 10000) / 100 : 0;
                              const updated = [...localPayouts];
                              updated[idx] = { rank: pay.rank, percentage: pct, amount: amt };
                              setLocalPayouts(updated);
                            }}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-1 py-1 text-[11px] text-amber-500 font-mono font-bold"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const updated = localPayouts.filter((_, i) => i !== idx).map((p, i) => ({ ...p, rank: i + 1 }));
                          setLocalPayouts(updated);
                        }}
                        className="text-red-500 hover:text-red-400 p-1 opacity-40 hover:opacity-100 transition mt-3"
                        title="Delete Rank"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    const nextRank = localPayouts.length + 1;
                    const newPayout = { rank: nextRank, percentage: 0, amount: 0 };
                    setLocalPayouts([...localPayouts, newPayout]);
                  }}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-400" /> Add Payout Rank
                </button>
                <button
                  onClick={() => {
                    const tempSettings = { ...formState };
                    const defaultPayouts = state.players ? tournamentStore.calculatePayouts(tempSettings, state.players) : [];
                    setLocalPayouts(defaultPayouts);
                  }}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-400" /> Reset to Default
                </button>
              </div>
            </div>

            {/* QUICK PRESETS */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-lg">
              <h2 className="text-xs font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 mb-4 flex items-center gap-2">
                <PlayCircle className="w-4 h-4 text-amber-500" /> Structure Presets
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button 
                  onClick={() => applyPresetStructure("standard")}
                  className="p-4 rounded-xl border border-zinc-800 hover:border-zinc-650 bg-zinc-950 hover:bg-zinc-950/80 text-left transition"
                >
                  <p className="text-sm font-black text-zinc-100">Standard Structure</p>
                  <p className="text-[10px] text-zinc-400 mt-1">20 minute levels, deep stack play, gradual blind increments.</p>
                </button>
                <button 
                  onClick={() => applyPresetStructure("turbo")}
                  className="p-4 rounded-xl border border-zinc-800 hover:border-zinc-650 bg-zinc-950 hover:bg-zinc-950/80 text-left transition"
                >
                  <p className="text-sm font-black text-amber-500">Turbo Structure</p>
                  <p className="text-[10px] text-zinc-400 mt-1">10 minute levels, faster transitions, aggressive chip movement.</p>
                </button>
                <button 
                  onClick={() => applyPresetStructure("hyper")}
                  className="p-4 rounded-xl border border-zinc-800 hover:border-zinc-650 bg-zinc-950 hover:bg-zinc-950/80 text-left transition"
                >
                  <p className="text-sm font-black text-red-500">Hyper Turbo Structure</p>
                  <p className="text-[10px] text-zinc-400 mt-1">5 minute levels, ultra rapid blinds, quick shoot-out dynamics.</p>
                </button>
              </div>
            </div>

          </div>

          {/* Blind structure list (Spans 1 column) */}
          <div className="lg:col-span-1 flex flex-col h-full bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                <Sliders className="w-4 h-4" /> Blind Structure
              </h2>
              <div className="flex items-center gap-1.5">
                <input
                  ref={blindImportInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleImportBlindStructure}
                />
                <button
                  onClick={() => blindImportInputRef.current?.click()}
                  className="p-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider"
                  title="Import from Excel (.xlsx, .xls, .csv)"
                >
                  <Upload className="w-3 h-3" /> Import
                </button>
                <button
                  onClick={handleExportBlindStructure}
                  disabled={formState.blindStructure.length === 0}
                  className="p-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Export to Excel"
                >
                  <Download className="w-3 h-3" /> Export
                </button>
                <button 
                  onClick={addBlindLevel}
                  className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider"
                >
                  <Plus className="w-3 h-3" /> Add Level
                </button>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">
              Excel import columns: Level, Small Blind, Big Blind, Ante, Duration (min), Type (Level/Break).
              Break rows can use Type=Break or leave blinds empty.
            </p>

            {/* Blind items scroll */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[500px] scrollbar-thin scrollbar-thumb-zinc-800">
              {formState.blindStructure.map((lvl, index) => {
                return (
                  <div 
                    key={index} 
                    className={`p-3.5 rounded-xl bg-zinc-950 border relative group transition-all ${
                      lvl.isBreak ? "border-amber-500/30 bg-amber-500/[0.01]" : "border-zinc-900 hover:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                        {lvl.isBreak ? "BREAK TIME" : `LEVEL ${lvl.level}`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => handleLevelToggleBreak(index)}
                          className="px-2 py-0.5 border border-zinc-800 text-[8px] font-black uppercase tracking-widest rounded bg-zinc-900 text-zinc-400 hover:text-zinc-100"
                        >
                          {lvl.isBreak ? "Make Level" : "Make Break"}
                        </button>
                        <button 
                          onClick={() => removeBlindLevel(index)}
                          className="text-red-500 hover:text-red-400 p-0.5 opacity-40 group-hover:opacity-100 transition"
                          title="Remove Level"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {lvl.isBreak ? (
                      <div>
                        <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-1">Duration (Min)</label>
                        <input 
                          type="number" 
                          value={lvl.duration} 
                          onChange={(e) => handleLevelChange(index, "duration", e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-amber-500 font-mono font-bold"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-1">Small</label>
                          <input 
                            type="number" 
                            value={lvl.smallBlind} 
                            onChange={(e) => handleLevelChange(index, "smallBlind", e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-100 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-1">Big</label>
                          <input 
                            type="number" 
                            value={lvl.bigBlind} 
                            onChange={(e) => handleLevelChange(index, "bigBlind", e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-100 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-1">Ante</label>
                          <input 
                            type="number" 
                            value={lvl.ante} 
                            onChange={(e) => handleLevelChange(index, "ante", e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-amber-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] text-amber-500 font-bold uppercase mb-1">Time</label>
                          <input 
                            type="number" 
                            value={lvl.duration !== undefined ? lvl.duration : formState.blindTime} 
                            onChange={(e) => handleLevelChange(index, "duration", e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded px-1.5 py-1 text-xs text-emerald-400 font-mono font-bold"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {formState.blindStructure.length === 0 && (
                <div className="text-center py-12 text-zinc-500 uppercase text-[10px] font-bold">
                  Structure empty. Apply a template preset above!
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {showNewTournamentConfirm ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-red-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setShowNewTournamentConfirm(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition"
              aria-label="Close new tournament confirmation"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-red-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black uppercase tracking-wider text-zinc-100">
                Start New Tournament?
              </h3>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed">
              This button is only for creating a brand-new tournament. It will permanently delete all current tournament data,
              including players, tables, clock progress, payouts, dealer rotation, floor calls, and history.
              Your license is not affected.
            </p>

            {hasTournamentData ? (
              <p className="text-sm text-amber-200/95 leading-relaxed font-medium border border-amber-500/30 bg-amber-500/10 rounded-xl px-3 py-2">
                You currently have saved tournament data. Export a JSON backup first if you may need this event again.
              </p>
            ) : null}

            <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">
              This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowNewTournamentConfirm(false)}
                className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase rounded-xl tracking-wider transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={backupBusy}
                onClick={() => void handleConfirmNewTournament()}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded-xl tracking-wider transition disabled:opacity-50"
              >
                Yes, Start New Tournament
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showImportConfirm && pendingImportPayload ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => {
                setShowImportConfirm(false);
                setPendingImportPayload(null);
                setPendingImportLabel("");
              }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition"
              aria-label="Close import confirmation"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-amber-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black uppercase tracking-wider text-zinc-100">
                Import Tournament Backup?
              </h3>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed">
              You are importing tournament data from <span className="text-amber-200 font-bold">{pendingImportLabel}</span>.
              This will delete all current tournament data and replace it with the imported backup
              (players, tables, clock, structure, payouts, dealers, and related records).
              License information is never imported or exported.
            </p>

            <p className="text-sm text-amber-200/95 leading-relaxed font-medium border border-amber-500/30 bg-amber-500/10 rounded-xl px-3 py-2">
              If you need to keep the current event, use Export JSON before continuing.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowImportConfirm(false);
                  setPendingImportPayload(null);
                  setPendingImportLabel("");
                }}
                className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase rounded-xl tracking-wider transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={backupBusy}
                onClick={() => void handleConfirmImport()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase rounded-xl tracking-wider transition disabled:opacity-50"
              >
                Yes, Replace With Import
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
