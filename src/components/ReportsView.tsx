/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useTournament } from "../useTournament";
import { FileText, Printer, FileSpreadsheet, ListOrdered, CircleDollarSign, HelpCircle, Activity } from "lucide-react";

export default function ReportsView() {
  const { state } = useTournament();
  const { players, tables, settings, payouts, history } = state;

  const [activeReport, setActiveReport] = useState<"chips" | "players" | "payouts" | "tables" | "eliminations">("chips");

  // Calculations
  const chipLeaders = [...players]
    .filter(p => p.status === "Playing" || p.status === "Waiting")
    .sort((a, b) => b.chips - a.chips);

  const rebuysReport = players.filter(p => p.rebuys > 0 || p.reentries > 0 || p.addons > 0);

  const eliminationOrder = [...players]
    .filter(p => p.status === "Eliminated" && p.eliminationOrder !== null)
    .sort((a, b) => (a.eliminationOrder || 0) - (b.eliminationOrder || 0));

  // Print Friendly layout trigger
  const handlePrint = () => {
    window.print();
  };

  // Export to simple CSV
  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (activeReport === "chips") {
      csvContent += "Rank,Player Name,Nickname,Country,Chip Count\n";
      chipLeaders.forEach((p, idx) => {
        csvContent += `${idx + 1},"${p.firstName} ${p.lastName}","${p.nickname}","${p.country}",${p.chips}\n`;
      });
    } else if (activeReport === "players") {
      csvContent += "Player Name,Nickname,Country,Phone,Status,Rebuys,Reentries,Addons\n";
      players.forEach((p) => {
        csvContent += `"${p.firstName} ${p.lastName}","${p.nickname}","${p.country}","${p.phone}","${p.status}",${p.rebuys},${p.reentries},${p.addons}\n`;
      });
    } else if (activeReport === "payouts") {
      csvContent += "Rank,Percentage,Amount ($)\n";
      payouts.forEach((pay) => {
        csvContent += `${pay.rank},${pay.percentage}%,${pay.amount}\n`;
      });
    } else if (activeReport === "tables") {
      csvContent += "Table Number,Occupancy,Seated Players\n";
      tables.forEach((t) => {
        const seatedNames = t.seats.map(sid => {
          const pl = players.find(p => p.id === sid);
          return pl ? `${pl.firstName} ${pl.lastName}` : "Empty";
        }).join(" | ");
        csvContent += `Table ${t.number},${t.seats.filter(s => s !== null).length}/10,"${seatedNames}"\n`;
      });
    } else {
      csvContent += "Elimination Rank,Player Name,Nickname,Country\n";
      eliminationOrder.forEach((p, idx) => {
        csvContent += `${idx + 1},"${p.firstName} ${p.lastName}","${p.nickname}","${p.country}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", encodedUri);
    downloadAnchor.setAttribute("download", `tournament_report_${activeReport}_${Date.now()}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="bg-zinc-950 text-zinc-100 p-6 min-h-screen print:bg-white print:text-black">
      <div className={`${activeReport === "tables" ? "max-w-[1650px] px-2" : "max-w-6xl"} mx-auto space-y-6 transition-all duration-300`}>
        
        {/* Header Title Bar (hides on print) */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4 print:hidden">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wider">OFFICIAL TOURNAMENT REPORTS</h1>
            <p className="text-zinc-400 text-xs mt-1">Generate lists of chip leads, cash payout ratios, active tables, or rebuy statistics.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={exportCSV}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#00e676]" /> Export CSV
            </button>
            <button 
              onClick={handlePrint}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase text-xs rounded-xl tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-amber-500/10"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Tab Selector Row (hides on print) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-900/40 border border-zinc-800 p-1.5 rounded-2xl shadow print:hidden">
          {[
            { id: "chips", label: "Chip Stack Leaderboard", icon: ListOrdered },
            { id: "players", label: "Rebuy / Financials Report", icon: Activity },
            { id: "payouts", label: "Cash Payout Ratios", icon: CircleDollarSign },
            { id: "tables", label: "Active Table Allocations", icon: FileText },
            { id: "eliminations", label: "Elimination Ordering", icon: HelpCircle }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeReport === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveReport(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 ${
                  active 
                    ? "bg-amber-500 text-black shadow" 
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60"
                }`}
              >
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Printed Document Header (Visible only on print!) */}
        <div className="hidden print:block text-center space-y-2 border-b-2 border-black pb-4 mb-6">
          <h1 className="text-3xl font-black uppercase tracking-tight">{settings.name || "Summer Poker Championship"}</h1>
          <p className="text-sm font-mono uppercase tracking-widest text-zinc-500">OFFICIAL TOURNAMENT AUDIT LOGS</p>
          <div className="grid grid-cols-3 text-xs font-mono text-zinc-400 pt-2 text-left">
            <span>TOURNAMENT ID: #{settings.id}</span>
            <span className="text-center">BUY-IN: ${settings.buyIn} + ${settings.fee}</span>
            <span className="text-right">PRINTED ON: {new Date().toLocaleString()}</span>
          </div>
        </div>

        {/* REPORT CONTENT VIEW BOX */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl shadow-lg p-6 print:border-0 print:p-0">
          
          {/* 1. CHIP LEADERBOARD REPORT */}
          {activeReport === "chips" && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 print:text-black">
                CHIP STACK LEADERBOARD
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-zinc-400 border-b border-zinc-850 print:text-black">
                      <th className="py-2.5">RANK</th>
                      <th className="py-2.5">PLAYER NAME</th>
                      <th className="py-2.5">NICKNAME</th>
                      <th className="py-2.5">COUNTRY</th>
                      <th className="py-2.5 text-right">CHIP COUNT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 text-sm print:text-black">
                    {chipLeaders.map((p, idx) => (
                      <tr key={p.id}>
                        <td className="py-2.5 font-mono font-bold text-amber-500">{idx + 1}</td>
                        <td className="py-2.5 font-bold">{p.firstName} {p.lastName}</td>
                        <td className="py-2.5 font-mono text-zinc-400">"{p.nickname}"</td>
                        <td className="py-2.5 text-zinc-350">{p.country}</td>
                        <td className="py-2.5 text-right font-mono font-black text-[#00e676] print:text-black">
                          {p.chips.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {chipLeaders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-500 italic">No playing players loaded</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. REBUY & FINANCIALS REPORT */}
          {activeReport === "players" && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 print:text-black">
                REBUY & CHIP RE-ENTRY FINANCIALS
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-zinc-400 border-b border-zinc-850 print:text-black">
                      <th className="py-2.5">PLAYER NAME</th>
                      <th className="py-2.5">STATUS</th>
                      <th className="py-2.5 text-center">RE-ENTRIES</th>
                      <th className="py-2.5 text-center">REBUYS</th>
                      <th className="py-2.5 text-center">ADD-ONS</th>
                      <th className="py-2.5 text-right">FINANCIAL TOTALS ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 text-sm print:text-black">
                    {rebuysReport.map((p) => {
                      const totalAddonCost = p.addons * settings.buyIn * 0.5; // estimated
                      const reentryCost = p.reentries * settings.buyIn;
                      const totalInvested = settings.buyIn + reentryCost + (p.rebuys * settings.buyIn * 0.5);
                      return (
                        <tr key={p.id}>
                          <td className="py-2.5 font-bold">{p.firstName} {p.lastName}</td>
                          <td className="py-2.5 font-semibold text-zinc-400">{p.status}</td>
                          <td className="py-2.5 text-center font-mono">{p.reentries}</td>
                          <td className="py-2.5 text-center font-mono">{p.rebuys}</td>
                          <td className="py-2.5 text-center font-mono">{p.addons}</td>
                          <td className="py-2.5 text-right font-mono font-black text-amber-500 print:text-black">
                            ${totalInvested.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {rebuysReport.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-zinc-500 italic">No rebuy/reentry transactions logged</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. CASH PAYOUT RATIOS */}
          {activeReport === "payouts" && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 print:text-black">
                CASH PAYOUT STRUCTURE ratios
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-zinc-400 border-b border-zinc-850 print:text-black">
                      <th className="py-2.5">RANK</th>
                      <th className="py-2.5">PERCENTAGE RANGE</th>
                      <th className="py-2.5 text-right">PAYOUT AMOUNT ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 text-sm print:text-black">
                    {payouts.map((pay) => (
                      <tr key={pay.rank}>
                        <td className="py-2.5 font-bold text-zinc-100 print:text-black">Rank {pay.rank}</td>
                        <td className="py-2.5 font-mono text-zinc-400">{pay.percentage}%</td>
                        <td className="py-2.5 text-right font-mono font-black text-[#00e676] print:text-black">
                          ${pay.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. ACTIVE TABLE ALLOCATIONS */}
          {activeReport === "tables" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <h3 className="text-sm font-black uppercase tracking-widest text-amber-500 print:text-black">
                  ACTIVE TABLE ALLOCATIONS
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase">
                  Total Tables: {tables.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {tables.map(table => {
                  const occupants = table.seats.filter(s => s !== null).length;
                  return (
                    <div key={table.id} className="p-2.5 rounded-xl border border-zinc-850 bg-zinc-950/40 hover:border-zinc-800 transition-all shadow flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
                          <span className="text-[11px] font-black text-amber-500 tracking-wider">TABLE {table.number}</span>
                          <span className="text-[10px] font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded font-mono">
                            {occupants}/10
                          </span>
                        </div>
                        <div className="text-[10px] space-y-0.5 font-mono">
                          {table.seats.map((sid, index) => {
                            const pl = sid ? players.find(p => p.id === sid) : null;
                            return (
                              <div key={index} className="flex justify-between items-center py-0.5 border-b border-zinc-900 last:border-0 hover:bg-zinc-900/30 px-1 rounded transition">
                                <span className="text-zinc-500 text-[9px] font-bold">K{index + 1}/S{index + 1}:</span>
                                <span className={`font-semibold truncate text-right max-w-[150px] ${pl ? "text-zinc-100 font-sans font-medium" : "text-zinc-700 italic text-[9px]"}`}>
                                  {pl ? `${pl.firstName} ${pl.lastName.toUpperCase()}` : "Empty"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. ELIMINATION ORDERING */}
          {activeReport === "eliminations" && (
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-amber-500 border-b border-zinc-800 pb-2 print:text-black">
                OFFICIAL ELIMINATION ORDER
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-zinc-400 border-b border-zinc-850 print:text-black">
                      <th className="py-2.5">ELIMINATION ORDER</th>
                      <th className="py-2.5">PLAYER NAME</th>
                      <th className="py-2.5">NICKNAME</th>
                      <th className="py-2.5">COUNTRY</th>
                      <th className="py-2.5 text-right">RE-ENTRIES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 text-sm print:text-black">
                    {eliminationOrder.map((p, index) => (
                      <tr key={p.id}>
                        <td className="py-2.5 font-mono font-bold text-red-500">#{index + 1}</td>
                        <td className="py-2.5 font-bold">{p.firstName} {p.lastName}</td>
                        <td className="py-2.5 font-mono text-zinc-400">"{p.nickname}"</td>
                        <td className="py-2.5 text-zinc-350">{p.country}</td>
                        <td className="py-2.5 text-right font-mono">{p.reentries}</td>
                      </tr>
                    ))}
                    {eliminationOrder.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-500 italic">No player eliminations registered yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
