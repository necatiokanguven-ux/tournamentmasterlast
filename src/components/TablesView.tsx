/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { useTournament } from "../useTournament";
import { useDealerControl } from "../dealerRotation/useDealerControl";
import { formatTableDealDuration, formatDealerTableTiming, getCurrentTableDealSeconds, getDealRemainingSeconds } from "../dealerRotation/dealerTimeUtils";
import { useLiveSecond } from "../dealerRotation/useLiveSecond";
import { dealerDisplayName } from "../server/dealerRotation/types";
import { Plus, Trash2, Skull, ShieldAlert, Users, Grid, RefreshCw, X, UserCheck, Undo2, QrCode, Timer, UserCog } from "lucide-react";
import { Table } from "../types";
import TableQrModal from "./TableQrModal";
import DealerTimerSettingsModal from "./DealerTimerSettingsModal";
import TableUndoModal from "./TableUndoModal";
import { CountryLabel } from "./CountryLabel";

export default function TablesView() {
  const {
    state,
    createTable,
    deleteTable,
    closeEmptyTables,
    seatPlayer,
    unseatPlayer,
    swapPlayers,
    balanceTables,
    deletePlayer,
    bustPlayer,
    undoTableActions,
    getTableUndoCount,
    getTableUndoEntries,
    getWaitingListPlayers,
    saveDealerTimers,
  } = useTournament();

  const {
    state: dealerState,
    assignDealer,
  } = useDealerControl(5000);

  const liveNow = useLiveSecond();

  const dealerTableMap = useMemo(() => {
    const map = new Map<string, {
      name: string | null;
      needsDealer: boolean;
      dealerState: string | null;
      dealLabel: string | null;
      rotationLabel: string | null;
    }>();
    for (const entry of dealerState.tables) {
      const staff = entry.dealerId
        ? dealerState.rotation.staff.find(s => s.id === entry.dealerId)
        : undefined;
      const dealSeconds = staff
        ? getCurrentTableDealSeconds(staff, liveNow, dealerState.rotation.settings)
        : entry.currentTableDealSeconds;
      const remainingSeconds = staff
        ? getDealRemainingSeconds(staff, liveNow)
        : entry.rotationRemainingSeconds;
      const timing = formatDealerTableTiming(
        entry.dealerState ? { state: entry.dealerState as "on_table" | "incoming" } : null,
        dealSeconds,
        remainingSeconds,
      );
      map.set(entry.id, {
        name: entry.dealerName,
        needsDealer: entry.needsDealer,
        dealerState: entry.dealerState,
        dealLabel: timing.dealLabel,
        rotationLabel: timing.rotationLabel,
      });
    }
    return map;
  }, [dealerState.tables, dealerState.rotation.staff, dealerState.rotation.settings, liveNow]);

  const rotationEnabled = dealerState.rotation.settings.enabled;

  const { players, tables, settings } = state;
  const undoCount = getTableUndoCount();
  const waitingPlayers = useMemo(() => getWaitingListPlayers(), [players, tables]);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(tables[0]?.id || null);
  const [qrTableNumber, setQrTableNumber] = useState<number | null>(null);
  const [timerSettingsOpen, setTimerSettingsOpen] = useState(false);
  const [undoModalOpen, setUndoModalOpen] = useState(false);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: "info" | "confirm_delete" | "confirm_bust" | "confirm_remove_waiting";
    title: string;
    message: string;
    tableIdToDelete?: string;
    playerIdToBust?: string;
    playerNameToBust?: string;
  }>({
    isOpen: false,
    type: "info",
    title: "",
    message: ""
  });

  const getPlayer = (id: string | null) => {
    if (!id) return null;
    return players.find(p => p.id === id) || null;
  };

  const handleDragStart = (e: React.DragEvent, id: string, source: "waiting" | "table", sourceTableId?: string, sourceSeatIdx?: number) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ playerId: id, source, sourceTableId, sourceSeatIdx }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverSeat = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropSeat = (e: React.DragEvent, destTableId: string, destSeatIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const dragData = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { playerId, source, sourceTableId, sourceSeatIdx } = dragData;

      if (source === "waiting") {
        seatPlayer(playerId, destTableId, destSeatIdx);
      } else if (source === "table") {
        if (sourceTableId === destTableId && sourceSeatIdx === destSeatIdx) return;

        const destOccupantId = tables.find(t => t.id === destTableId)?.seats[destSeatIdx];
        if (destOccupantId) {
          swapPlayers(playerId, destOccupantId);
        } else {
          seatPlayer(playerId, destTableId, destSeatIdx);
        }
      }
    } catch (err) {
      console.error("Dnd drop parsing error", err);
    }
  };

  const handleDropWaitingList = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dragData = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { playerId, source } = dragData;
      if (source === "table") {
        unseatPlayer(playerId);
      }
    } catch (err) {
      console.error("Dnd waiting drop parsing error", err);
    }
  };

  const handleRandomAutoSeat = () => {
    if (waitingPlayers.length === 0) {
      setModal({
        isOpen: true,
        type: "info",
        title: "Waiting List Empty",
        message: "There are no players in the waiting list to seat!"
      });
      return;
    }

    if (tables.length === 0) {
      setModal({
        isOpen: true,
        type: "info",
        title: "No Tables Available",
        message: "You must create an active table first!"
      });
      return;
    }

    const emptySeats: { tableId: string; seatIdx: number }[] = [];
    tables.forEach(table => {
      for (let i = 0; i < 9; i++) {
        if (table.seats[i] === null) {
          emptySeats.push({ tableId: table.id, seatIdx: i });
        }
      }
    });

    if (emptySeats.length === 0) {
      setModal({
        isOpen: true,
        type: "info",
        title: "Tables Full",
        message: "No empty seats available at any tables! Please create a new table."
      });
      return;
    }

    const shuffledPlayers = [...waitingPlayers];
    for (let i = shuffledPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
    }

    const shuffledSeats = [...emptySeats];
    for (let i = shuffledSeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledSeats[i], shuffledSeats[j]] = [shuffledSeats[j], shuffledSeats[i]];
    }

    const limit = Math.min(shuffledPlayers.length, shuffledSeats.length);
    for (let i = 0; i < limit; i++) {
      seatPlayer(shuffledPlayers[i].id, shuffledSeats[i].tableId, shuffledSeats[i].seatIdx);
    }
  };

  const handleDeleteTableClick = (tableId: string, isOccupied: boolean) => {
    if (isOccupied) {
      setModal({
        isOpen: true,
        type: "confirm_delete",
        title: "Delete Table",
        message: "There are active players seated at this table! If you delete this table, these players will be automatically returned to the Waiting List. Do you want to continue?",
        tableIdToDelete: tableId
      });
    } else {
      deleteTable(tableId);
      if (selectedTableId === tableId) {
        setSelectedTableId(tables.find(t => t.id !== tableId)?.id || null);
      }
    }
  };

  const handleConfirmDeleteTable = () => {
    if (modal.tableIdToDelete) {
      deleteTable(modal.tableIdToDelete);
      if (selectedTableId === modal.tableIdToDelete) {
        setSelectedTableId(tables.find(t => t.id !== modal.tableIdToDelete)?.id || null);
      }
    }
    setModal(prev => ({ ...prev, isOpen: false }));
  };

  const handleRemovePlayer = (playerId: string) => {
    const player = getPlayer(playerId);
    if (!player) return;

    setModal({
      isOpen: true,
      type: "confirm_bust",
      title: "Eliminate Player",
      message: `${player.firstName} ${player.lastName} — are you sure you want to eliminate this player?`,
      playerIdToBust: playerId,
      playerNameToBust: `${player.firstName} ${player.lastName}`,
    });
  };

  const handleConfirmBustPlayer = () => {
    if (modal.playerIdToBust) {
      bustPlayer(modal.playerIdToBust);
    }
    setModal(prev => ({ ...prev, isOpen: false, playerIdToBust: undefined, playerNameToBust: undefined }));
  };

  const handleDeleteWaitingPlayer = (playerId: string) => {
    const player = getPlayer(playerId);
    if (!player) return;

    setModal({
      isOpen: true,
      type: "confirm_remove_waiting",
      title: "Remove From Waiting List",
      message: `${player.firstName} ${player.lastName} — are you sure you want to remove this player from the waiting list?`,
      playerIdToBust: playerId,
    });
  };

  const handleConfirmRemoveWaitingPlayer = () => {
    if (modal.playerIdToBust) {
      deletePlayer(modal.playerIdToBust);
    }
    setModal(prev => ({ ...prev, isOpen: false, playerIdToBust: undefined }));
  };

  const renderTableCard = (table: Table) => {
    const occupants = table.seats.filter(s => s !== null).length;
    const dealerInfo = dealerTableMap.get(table.id);
    const needsDealer = rotationEnabled && (dealerInfo?.needsDealer ?? true);

    return (
      <div
        key={table.id}
        className={`bg-zinc-900/65 border rounded-md p-1.5 shadow-md flex flex-col transition ${
          needsDealer
            ? "border-red-500/70 animate-pulse shadow-red-500/20"
            : "border-zinc-800 hover:border-zinc-700"
        }`}
      >
        <div className="flex items-start justify-between mb-0.5 gap-1">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1 flex-wrap">
              <h2 className="text-[10px] font-black tracking-widest text-amber-400 uppercase leading-none shrink-0">
                TABLE {table.number}
              </h2>
              <button
                type="button"
                onClick={() => setQrTableNumber(table.number)}
                className="px-1 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-[8px] font-black uppercase text-amber-300 hover:bg-amber-500/20 shrink-0"
                title="Dealer Tablet QR"
              >
                <span className="inline-flex items-center gap-0.5">
                  <QrCode className="w-2.5 h-2.5" />
                  QR
                </span>
              </button>
            </div>
            {rotationEnabled ? (
              <div className="space-y-0.5">
                <p
                  className={`text-[9px] font-bold uppercase tracking-wide leading-tight ${
                    needsDealer ? "text-red-400" : "text-emerald-400/90"
                  }`}
                >
                  {dealerInfo?.name ?? "No dealer assigned"}
                </p>
                {dealerInfo?.dealLabel ? (
                  <p className="text-[8px] font-mono leading-tight text-emerald-400/80">
                    Deal: {dealerInfo.dealLabel}
                    {dealerInfo.rotationLabel ? (
                      <span className="text-amber-400/80"> · Rot: {dealerInfo.rotationLabel}</span>
                    ) : null}
                  </p>
                ) : dealerInfo?.dealerState === "incoming" ? (
                  <p className="text-[8px] font-bold uppercase text-orange-400/90">Handoff</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            onClick={() => handleDeleteTableClick(table.id, occupants > 0)}
            className="p-0.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition shrink-0"
            title="Delete Table"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="border-b border-zinc-800/80 mb-0.5" />

        <div className="space-y-px">
          {Array.from({ length: Math.min(table.seats.length, 9) }).map((_, seatIdx) => {
            const playerId = table.seats[seatIdx];
            const player = getPlayer(playerId);

            return (
              <div
                key={seatIdx}
                draggable={!!player}
                onDragStart={(e) => {
                  if (!player) return;
                  handleDragStart(e, player.id, "table", table.id, seatIdx);
                }}
                onDragOver={handleDragOverSeat}
                onDrop={(e) => handleDropSeat(e, table.id, seatIdx)}
                className={`px-1 py-px rounded border transition flex items-center justify-between gap-0.5 min-h-[22px] ${
                  player
                    ? "bg-zinc-950 border-zinc-800 hover:border-zinc-700 cursor-grab active:cursor-grabbing"
                    : "bg-zinc-950/20 border-dashed border-zinc-850 hover:border-amber-500/40 hover:bg-amber-500/5"
                }`}
              >
                <div className="flex items-center gap-1 overflow-hidden flex-1 min-w-0">
                  <span
                    className={`w-4 h-4 rounded text-[8px] font-mono font-black flex items-center justify-center border shrink-0 ${
                      player
                        ? "bg-zinc-900 border-zinc-850 text-amber-500"
                        : "bg-zinc-950/30 border-zinc-900 text-zinc-600"
                    }`}
                  >
                    {seatIdx + 1}
                  </span>

                  {player ? (
                    <p className="text-[10px] font-bold text-zinc-100 uppercase tracking-tight truncate leading-none">
                      {player.firstName} {player.lastName}
                    </p>
                  ) : (
                    <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wide leading-none">
                      EMPTY
                    </span>
                  )}
                </div>

                {player && (
                  <button
                    type="button"
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePlayer(player.id);
                    }}
                    className="w-5 h-5 rounded bg-red-950/40 border border-red-900/50 hover:border-red-500 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition flex items-center justify-center shrink-0"
                    title="Eliminate player from tournament"
                  >
                    <Skull className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-zinc-950 text-zinc-100 h-full select-none font-sans flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black uppercase tracking-wider text-zinc-100">TABLES</h1>
            <p className="text-zinc-500 text-[10px]">Drag players between tables, waiting list, and empty seats.</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTimerSettingsOpen(true)}
              className="px-2.5 py-1 bg-zinc-900 border border-cyan-500/30 hover:bg-cyan-500/10 rounded-lg text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1 text-cyan-300"
            >
              <Timer className="w-3.5 h-3.5" /> Dealer Timers
            </button>
            <button
              type="button"
              onClick={() => setUndoModalOpen(true)}
              disabled={undoCount === 0}
              className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 hover:border-sky-500/50 hover:bg-sky-500/10 rounded-lg text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1 text-sky-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900"
              title={undoCount > 0 ? `Review and undo table actions (${undoCount} available)` : "No actions to undo"}
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
              {undoCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-sky-500/20 border border-sky-500/30 text-[9px] font-black leading-none flex items-center justify-center">
                  {undoCount}
                </span>
              )}
            </button>
            <button
              onClick={handleRandomAutoSeat}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1"
            >
              <UserCheck className="w-3.5 h-3.5" /> Auto Seat
            </button>
            <button
              onClick={balanceTables}
              className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1 text-amber-400"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Balance
            </button>
            <button
              onClick={closeEmptyTables}
              className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1 text-zinc-400"
            >
              <Trash2 className="w-3.5 h-3.5" /> Close Empty
            </button>
            <button
              onClick={createTable}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase text-[10px] rounded-lg tracking-wider transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> New Table
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-2 p-2 min-h-0 overflow-hidden">
        <div className="flex-[3] min-w-0 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
          {tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900/10 h-full min-h-[200px]">
              <Grid className="w-10 h-10 text-zinc-700 mb-3" />
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">No Active Tables</p>
              <p className="text-zinc-600 text-[10px] mt-1 max-w-sm text-center">
                Create a table using the New Table button above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 items-start">
              {tables.map(renderTableCard)}
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropWaitingList}
          className="flex-1 min-w-[200px] max-w-[260px] flex flex-col bg-zinc-900/60 rounded-xl border border-zinc-800 p-2.5 shadow-xl shrink-0 overflow-hidden"
          id="waiting-list-zone"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2 shrink-0">
            <div className="flex items-center gap-1.5 text-zinc-300 text-[10px] font-black uppercase tracking-wider">
              <Users className="w-3.5 h-3.5 text-amber-500" /> WAITING LIST
            </div>
            <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-full border border-amber-500/20">
              {waitingPlayers.length}
            </span>
          </div>

          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-2 bg-zinc-950 p-1.5 rounded border border-zinc-800 leading-snug shrink-0">
            Drag to any empty seat. Drag between tables to move players.
          </p>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 scrollbar-thin scrollbar-thumb-zinc-800 min-h-0">
            {waitingPlayers.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => handleDragStart(e, p.id, "waiting")}
                className="p-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 cursor-grab active:cursor-grabbing rounded-lg flex items-center justify-between transition shadow group"
              >
                <div className="overflow-hidden flex-1 pr-1 min-w-0">
                  <p className="text-[11px] font-bold text-zinc-200 uppercase truncate leading-tight">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-[9px] text-zinc-500 mt-0.5 font-mono inline-flex items-center gap-1.5 flex-wrap">
                    <CountryLabel country={p.country || "Turkey"} flagClassName="text-sm leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]" className="text-[9px] gap-1" />
                    <span>• {p.chips.toLocaleString()}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWaitingPlayer(p.id);
                  }}
                  className="w-6 h-6 rounded bg-zinc-900 border border-zinc-800 hover:border-red-500/50 hover:bg-red-500/15 text-zinc-500 hover:text-red-400 transition flex items-center justify-center shrink-0"
                  title="Remove player from waiting list"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {waitingPlayers.length === 0 && (
              <div className="text-center py-12 text-zinc-600 uppercase text-[9px] font-bold font-mono tracking-wider">
                Waiting list is empty
              </div>
            )}
          </div>

          {rotationEnabled ? (
            <div className="mt-3 pt-2 border-t border-zinc-800 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-orange-300">
                  <UserCog className="w-3 h-3" /> Dealer Pool
                </div>
                <span className="text-[9px] font-mono text-zinc-500">
                  {dealerState.rotation.poolQueue.length + dealerState.rotation.waitingList.length}
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {[...dealerState.rotation.waitingList, ...dealerState.rotation.poolQueue].map((dealerId) => {
                  const dealer = dealerState.rotation.staff.find(s => s.id === dealerId);
                  if (!dealer) return null;
                  return (
                    <div key={dealerId} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">
                      <p className="text-[10px] font-bold truncate">{dealerDisplayName(dealer)}</p>
                      <p className="text-[8px] text-zinc-500 uppercase">{dealer.state}</p>
                      <select
                        className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 text-[9px] py-0.5"
                        defaultValue=""
                        onChange={(e) => {
                          const tableId = e.target.value;
                          if (tableId) void assignDealer(dealerId, tableId);
                          e.target.value = "";
                        }}
                      >
                        <option value="">Assign to table...</option>
                        {tables.map(t => (
                          <option key={t.id} value={t.id}>Table {t.number}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {qrTableNumber !== null ? (
        <TableQrModal tableNumber={qrTableNumber} onClose={() => setQrTableNumber(null)} />
      ) : null}

      {timerSettingsOpen ? (
        <DealerTimerSettingsModal
          timerMode={settings.dealerTimerMode ?? "call_time"}
          callTimeSeconds={settings.dealerCallTimeSeconds ?? 30}
          playerTimeSeconds={settings.dealerPlayerTimeSeconds ?? 60}
          onSave={saveDealerTimers}
          onClose={() => setTimerSettingsOpen(false)}
        />
      ) : null}

      {undoModalOpen ? (
        <TableUndoModal
          entries={getTableUndoEntries()}
          onUndo={(selectedIds) => undoTableActions(selectedIds)}
          onClose={() => setUndoModalOpen(false)}
        />
      ) : null}

      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-amber-500">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black uppercase tracking-wider text-zinc-100">
                {modal.title}
              </h3>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed font-medium">
              {modal.message}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              {modal.type === "confirm_delete" ? (
                <>
                  <button
                    onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase rounded-xl tracking-wider transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDeleteTable}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded-xl tracking-wider transition"
                  >
                    Yes, Delete
                  </button>
                </>
              ) : modal.type === "confirm_bust" ? (
                <>
                  <button
                    onClick={() => setModal(prev => ({ ...prev, isOpen: false, playerIdToBust: undefined, playerNameToBust: undefined }))}
                    className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase rounded-xl tracking-wider transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmBustPlayer}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded-xl tracking-wider transition"
                  >
                    Yes, Eliminate
                  </button>
                </>
              ) : modal.type === "confirm_remove_waiting" ? (
                <>
                  <button
                    onClick={() => setModal(prev => ({ ...prev, isOpen: false, playerIdToBust: undefined }))}
                    className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase rounded-xl tracking-wider transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmRemoveWaitingPlayer}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded-xl tracking-wider transition"
                  >
                    Yes, Remove
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-black uppercase rounded-xl tracking-wider transition"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
