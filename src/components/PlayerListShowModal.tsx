/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { X, FileSpreadsheet, Printer, Eye } from "lucide-react";
import type { HistoryEvent, Player } from "../types";
import { CountryLabel } from "./CountryLabel";
import {
  exportPlayerRegistryCsv,
  formatEventLine,
  formatPlayerNameDisplay,
  formatPlayerStatusDisplay,
  formatPlayerTableSeat,
  getEventsForPlayer,
  openPlayerRegistryPrintWindow,
  playerFullName,
  sortPlayersForReport,
} from "../utils/playerRegistryReport";

interface PlayerListShowModalProps {
  players: Player[];
  history: HistoryEvent[];
  tournamentName: string;
  tables: Array<{ id: string; number: number }>;
  onClose: () => void;
}

export default function PlayerListShowModal({
  players,
  history,
  tournamentName,
  tables,
  onClose,
}: PlayerListShowModalProps) {
  const sortedPlayers = useMemo(() => sortPlayersForReport(players), [players]);

  const handleExportCsv = () => {
    exportPlayerRegistryCsv(players, history, tournamentName, tables);
  };

  const handleExportPdf = () => {
    openPlayerRegistryPrintWindow(players, history, tournamentName, tables);
  };

  return createPortal(
    <div
      id="player-list-show-portal"
      className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:static print:inset-auto print:bg-white print:p-0 print:overflow-visible"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-[96rem] flex flex-col max-h-[calc(100vh-2rem)] my-2 overflow-hidden print:max-w-none print:max-h-none print:my-0 print:border-0 print:rounded-none print:shadow-none print:overflow-visible print:bg-white">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-6 py-4 bg-zinc-900 print:hidden">
          <h3 className="text-md font-black uppercase text-zinc-100 tracking-wider flex items-center gap-2">
            <Eye className="w-5 h-5 text-amber-500" />
            Player List Show — Full Registry Report
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-650 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 text-zinc-100"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="px-4 py-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-650 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 text-zinc-100"
            >
              <Printer className="w-3.5 h-3.5" /> Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div id="player-registry-report" className="flex-1 min-h-0 overflow-y-auto px-6 py-5 print:overflow-visible print:px-8 print:py-6">
          <div className="hidden print:block text-center space-y-1 border-b-2 border-black pb-4 mb-6">
            <h1 className="text-2xl font-black uppercase tracking-wider">{tournamentName}</h1>
            <p className="text-sm font-bold uppercase tracking-widest">Player Registry & Tournament Activity Report</p>
            <p className="text-xs text-zinc-600">Generated {new Date().toLocaleString()}</p>
          </div>

          <p className="text-xs text-zinc-400 mb-4 print:hidden">
            Complete player records including phone numbers and all tournament activity (rebuys, add-ons, re-entries, busts, seating, etc.).
          </p>

          <div className="space-y-8">
            <section>
              <h4 className="text-xs font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 mb-3 print:text-black print:border-black">
                Player Registry ({sortedPlayers.length})
              </h4>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left border-collapse text-xs print:text-[10px]">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400 print:text-black print:border-black">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Player</th>
                      <th className="py-2 pr-3">Nickname</th>
                      <th className="py-2 pr-3">Country</th>
                      <th className="py-2 pr-3">Phone</th>
                      <th className="py-2 pr-3">Birth Date</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-center">Rebuys</th>
                      <th className="py-2 pr-3 text-center">Re-entries</th>
                      <th className="py-2 pr-3 text-center">Add-ons</th>
                      <th className="py-2 pr-3">Table / Seat</th>
                      <th className="py-2 pr-3">Registered</th>
                      <th className="py-2 pr-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 print:divide-black/20">
                    {sortedPlayers.map((player, index) => (
                      <tr key={player.id} className="print:text-black">
                        <td className="py-2 pr-3 font-mono text-zinc-500 print:text-black">{index + 1}</td>
                        <td className="py-2 pr-3 font-bold text-zinc-100 uppercase print:text-black">{playerFullName(player)}</td>
                        <td className="py-2 pr-3 font-mono text-yellow-500 uppercase print:text-black">
                          {player.nickname ? formatPlayerNameDisplay(player.nickname) : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <CountryLabel country={player.country} />
                        </td>
                        <td className="py-2 pr-3 font-mono text-zinc-300 print:text-black">{player.phone || "—"}</td>
                        <td className="py-2 pr-3 font-mono text-zinc-400 print:text-black">{player.birthDate || "—"}</td>
                        <td className="py-2 pr-3 font-black uppercase tracking-wider print:text-black">
                          {formatPlayerStatusDisplay(player.status)}
                        </td>
                        <td className="py-2 pr-3 text-center font-mono print:text-black">{player.rebuys}</td>
                        <td className="py-2 pr-3 text-center font-mono print:text-black">{player.reentries}</td>
                        <td className="py-2 pr-3 text-center font-mono print:text-black">{player.addons}</td>
                        <td className="py-2 pr-3 print:text-black">
                          {player.tableId
                            ? formatPlayerTableSeat(player, tables, "slash")
                            : "Unseated"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-zinc-400 whitespace-nowrap print:text-black">
                          {new Date(player.registeredAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-zinc-400 max-w-[12rem] print:text-black">{player.notes || "—"}</td>
                      </tr>
                    ))}
                    {sortedPlayers.length === 0 && (
                      <tr>
                        <td colSpan={13} className="py-8 text-center text-zinc-500 uppercase font-bold print:text-black">
                          No players registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 mb-3 print:text-black print:border-black">
                Tournament Activity Log
              </h4>
              <div className="space-y-4">
                {sortedPlayers.map((player) => {
                  const events = getEventsForPlayer(history, player);
                  if (events.length === 0) return null;

                  return (
                    <div
                      key={`activity-${player.id}`}
                      className="border border-zinc-800 rounded-xl p-4 bg-zinc-950/40 print:border-black print:bg-white print:break-inside-avoid"
                    >
                      <p className="text-sm font-black text-zinc-100 mb-2 uppercase print:text-black">
                        {playerFullName(player)}
                        <span className="ml-2 text-[10px] font-mono text-zinc-500 print:text-black">
                          ({events.length} event{events.length !== 1 ? "s" : ""})
                        </span>
                      </p>
                      <ul className="space-y-1 text-[11px] font-mono text-zinc-400 print:text-black">
                        {events.map((event) => (
                          <li key={event.id}>{formatEventLine(event)}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {sortedPlayers.every((player) => getEventsForPlayer(history, player).length === 0) && (
                  <p className="text-xs text-zinc-500 uppercase font-bold print:text-black">No tournament activity recorded yet.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
