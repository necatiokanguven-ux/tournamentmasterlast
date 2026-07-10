/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useTournament } from "../useTournament";
import { Plus, Trash2, ShieldAlert, Users, Grid, RefreshCw, X, UserCheck, Skull } from "lucide-react";
import { Table } from "../types";

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
    bustPlayer,
    deletePlayer
  } = useTournament();

  const { players, tables } = state;

  const [selectedTableId, setSelectedTableId] = useState<string | null>(tables[0]?.id || null);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: "info" | "confirm_delete";
    title: string;
    message: string;
    tableIdToDelete?: string;
  }>({
    isOpen: false,
    type: "info",
    title: "",
    message: ""
  });

  const waitingPlayers = players.filter(p => p.status === "Waiting" || p.status === "Registered");

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

  const handleBustPlayer = (playerId: string) => {
    bustPlayer(playerId);
  };

  const handleDeleteWaitingPlayer = (playerId: string) => {
    deletePlayer(playerId);
  };

  const renderTableCard = (table: Table) => {
    const occupants = table.seats.slice(0, 9).filter(s => s !== null).length;

    return (
      <div
        key={table.id}
        className="bg-zinc-900/65 border border-zinc-800 rounded-md p-1.5 shadow-md flex flex-col transition hover:border-zinc-700"
      >
        <div className="flex items-center justify-between mb-0.5">
          <h2 className="text-[10px] font-black tracking-widest text-amber-400 uppercase leading-none">
            TABLE {table.number}
          </h2>
          <button
            onClick={() => handleDeleteTableClick(table.id, occupants > 0)}
            className="p-0.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition"
            title="Delete Table"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="border-b border-zinc-800/80 mb-0.5" />

        <div className="space-y-px">
          {Array.from({ length: 9 }).map((_, seatIdx) => {
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
                      handleBustPlayer(player.id);
                    }}
                    className="w-5 h-5 rounded bg-red-950/40 border border-red-900/50 hover:border-red-500 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition flex items-center justify-center shrink-0"
                    title="Bust Player"
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
                  <p className="text-[9px] text-zinc-500 mt-0.5 font-mono">
                    {p.country || "TR"} • {p.chips.toLocaleString()}
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
        </div>
      </div>

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
