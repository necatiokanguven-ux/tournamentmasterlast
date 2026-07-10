/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import ClockView from "./components/ClockView";
import SettingsView from "./components/SettingsView";
import PlayersView from "./components/PlayersView";
import TablesView from "./components/TablesView";
import ReportsView from "./components/ReportsView";
import DisplayView from "./components/DisplayView";
import { Timer, Settings, Users, Grid, FileText, ChevronLeft, ChevronRight, Monitor } from "lucide-react";

type AppTab = "clock" | "settings" | "players" | "tables" | "reports" | "display";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("clock");
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [pendingClockFullscreen, setPendingClockFullscreen] = useState(false);

  const handleLaunchClockFullscreen = () => {
    setPendingClockFullscreen(true);
    setActiveTab("clock");
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      
      {/* Sidebar Navigation Panel (collapses on fullscreen print and option toggle) */}
      <aside 
        className={`bg-zinc-900 border-r border-zinc-800 flex flex-col justify-between transition-all duration-300 print:hidden ${
          isNavCollapsed ? "w-16" : "w-64"
        }`}
        id="sidebar-navigation"
      >
        <div className="flex flex-col flex-1">
          {/* Top Branding Section */}
          <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
            {!isNavCollapsed && (
              <div className="flex items-center gap-2">
                <span className="text-xl">♠️</span>
                <span className="font-black tracking-wider uppercase text-sm">DIRECTOR PRO</span>
              </div>
            )}
            <button 
              onClick={() => setIsNavCollapsed(prev => !prev)}
              className="p-1 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-600 transition text-zinc-400 hover:text-zinc-100 mx-auto"
            >
              {isNavCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
 
          {/* Navigation Links List */}
          <nav className="p-3 space-y-1.5 flex-1">
            {[
              { id: "clock", label: "Tournament Clock", icon: Timer, color: "text-red-500" },
              { id: "display", label: "Display Manager", icon: Monitor, color: "text-cyan-500" },
              { id: "tables", label: "Tables", icon: Grid, color: "text-emerald-500" },
              { id: "players", label: "Player Management", icon: Users, color: "text-blue-500" },
              { id: "settings", label: "Tournament Setup", icon: Settings, color: "text-amber-500" },
              { id: "reports", label: "Tournament Reports", icon: FileText, color: "text-purple-500" }
            ].map((nav) => {
              const Icon = nav.icon;
              const active = activeTab === nav.id;
              return (
                <button
                  key={nav.id}
                  onClick={() => setActiveTab(nav.id as AppTab)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    active 
                      ? "bg-gradient-to-r from-zinc-800 to-zinc-900/40 border border-zinc-800 text-zinc-100 font-extrabold shadow-sm" 
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
                  }`}
                  title={isNavCollapsed ? nav.label : ""}
                >
                  <Icon className={`w-4 h-4 ${nav.color}`} />
                  {!isNavCollapsed && <span>{nav.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info inside nav */}
        {!isNavCollapsed && (
          <div className="p-4 border-t border-zinc-800/60 text-[9px] font-mono text-zinc-500 text-center">
            Tournament Director v4.1 • Live
          </div>
        )}
      </aside>

      {/* Main Panel Content Box */}
      <main
        className={`flex-1 flex flex-col min-h-0 ${
          activeTab === "tables" ? "overflow-hidden" : "overflow-y-auto"
        }`}
        id="main-content-canvas"
      >
        {activeTab === "clock" && (
          <ClockView
            pendingFullscreen={pendingClockFullscreen}
            onFullscreenHandled={() => setPendingClockFullscreen(false)}
          />
        )}
        {activeTab === "display" && <DisplayView onLaunchClockFullscreen={handleLaunchClockFullscreen} />}
        {activeTab === "settings" && <SettingsView />}
        {activeTab === "players" && <PlayersView />}
        {activeTab === "tables" && <TablesView />}
        {activeTab === "reports" && <ReportsView />}
      </main>

    </div>
  );
}
