/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from "react";
import LocalServerBanner from "./components/LocalServerBanner";
import VenuePortHint from "./components/VenuePortHint";
import ClockView from "./components/ClockView";
import SettingsView from "./components/SettingsView";
import PlayersView from "./components/PlayersView";
import TablesView from "./components/TablesView";
import ReportsView from "./components/ReportsView";
import DealerControlView from "./components/DealerControlView";
import DisplayView from "./components/DisplayView";
import LicenseView from "./components/LicenseView";
import { useLicenseStatus } from "./license/useLicenseStatus";
import { getLicenseNavStatus } from "./license/licenseDisplay";
import { tournamentStore } from "./store";
import { isWsEnabled } from "./config/featureFlags";
import { useTournamentSocket } from "./websocket/useTournamentSocket";
import { isClockChannelPayload } from "./websocket/clockChannelTypes";
import SystemHealthView from "./components/SystemHealthView";
import { useSystemHealthNavStatus, toneClass, statusBadgeClass, healthNavStatusClass } from "./systemHealth/useSystemHealthNavStatus";
import { Timer, Settings, Users, Grid, FileText, ChevronLeft, ChevronRight, Monitor, KeyRound, Lock, UserCog, Shield } from "lucide-react";

type AppTab = "clock" | "license" | "settings" | "players" | "tables" | "dealer-control" | "reports" | "display" | "system-health";

export default function App() {
  const { isLicensed, loading: licenseLoading, status: licenseStatus } = useLicenseStatus();
  const [activeTab, setActiveTab] = useState<AppTab>("clock");
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [pendingClockFullscreen, setPendingClockFullscreen] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const wsState = useTournamentSocket({
    enabled: isWsEnabled(),
    channels: ["meta", "director", "clock"],
    onMessage: (message) => {
      if (message.type !== "delta" && message.type !== "snapshot") return;

      if (message.channel === "clock") {
        if (isClockChannelPayload(message.payload)) {
          tournamentStore.applyRemoteClock(message.payload);
        }
        return;
      }

      if (message.channel === "meta" || message.channel === "director") {
        void tournamentStore.syncFromServer();
      }
    },
  });

  useEffect(() => {
    let cancelled = false;

    void tournamentStore.load().finally(() => {
      if (!cancelled) {
        setDataReady(true);
      }
    });

    const onLicenseUpdated = () => {
      void tournamentStore.load({ force: true });
    };
    window.addEventListener("license-updated", onLicenseUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("license-updated", onLicenseUpdated);
    };
  }, []);

  useEffect(() => {
    if (!licenseLoading && isLicensed) {
      void tournamentStore.load({ force: true });
    }
  }, [licenseLoading, isLicensed]);

  useEffect(() => {
    if (!licenseLoading && !isLicensed) {
      setActiveTab("license");
      return;
    }
    if (isLicensed && window.location.hash === "#system-health") {
      setActiveTab("system-health");
    }
  }, [licenseLoading, isLicensed]);

  const handleLaunchClockFullscreen = () => {
    if (!isLicensed) {
      setActiveTab("license");
      return;
    }

    setPendingClockFullscreen(true);
    setActiveTab("clock");
  };

  const handleTabSelect = (tab: AppTab) => {
    if (!isLicensed && tab !== "license") {
      setActiveTab("license");
      return;
    }

    setActiveTab(tab);
  };

  const licenseNavStatus = getLicenseNavStatus(licenseLoading, isLicensed, licenseStatus);
  const systemHealthNav = useSystemHealthNavStatus(isLicensed && !licenseLoading);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans flex-col">
      <LocalServerBanner />
      <VenuePortHint />
      {wsState.enabled && wsState.reconnecting ? (
        <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 py-2 text-orange-200 text-xs font-bold uppercase tracking-wider">
          WebSocket reconnecting — using HTTP fallback until live push returns
        </div>
      ) : null}
      {!licenseLoading && !isLicensed && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-3 text-red-200 text-sm flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
          <p>
            Install the local server, open <strong className="text-red-100">License Key</strong>, enter your existing license key or sign in to PokerClup for trial or a paid plan.
            {licenseStatus?.message ? ` ${licenseStatus.message}` : ""}
          </p>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
      
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
                <span className="font-black tracking-wider uppercase text-sm">TM STANDART</span>
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
              { id: "license", label: "License Key", icon: KeyRound, color: "text-amber-400" },
              { id: "display", label: "Display Manager", icon: Monitor, color: "text-cyan-500" },
              { id: "tables", label: "Tables", icon: Grid, color: "text-emerald-500" },
              { id: "players", label: "Player Management", icon: Users, color: "text-blue-500" },
              { id: "settings", label: "Tournament Setup", icon: Settings, color: "text-amber-500" },
              { id: "dealer-control", label: "Dealer Control", icon: UserCog, color: "text-orange-500" },
              { id: "system-health", label: "System Health", icon: Shield, color: "text-emerald-400", healthNav: true },
              { id: "reports", label: "Tournament Reports", icon: FileText, color: "text-purple-500" }
            ].map((nav) => {
              const Icon = nav.icon;
              const active = activeTab === nav.id;
              const locked = !isLicensed && nav.id !== "license";
              const isLicenseNav = nav.id === "license";
              const isHealthNav = Boolean((nav as { healthNav?: boolean }).healthNav);
              const statusToneClass =
                licenseNavStatus.tone === "active"
                  ? "text-emerald-400"
                  : licenseNavStatus.tone === "inactive"
                    ? "text-red-400"
                    : "text-zinc-500";
              const healthToneClass = toneClass(systemHealthNav.tone);

              return (
                <button
                  key={nav.id}
                  onClick={() => handleTabSelect(nav.id as AppTab)}
                  disabled={licenseLoading}
                  className={`w-full rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    isLicenseNav || isHealthNav ? "px-3 py-2" : "flex items-center gap-3 px-3 py-2.5"
                  } ${
                    active
                      ? "bg-gradient-to-r from-zinc-800 to-zinc-900/40 border border-zinc-800 text-zinc-100 font-extrabold shadow-sm"
                      : locked
                        ? "text-zinc-600 cursor-not-allowed opacity-60"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
                  }`}
                  title={
                    isNavCollapsed
                      ? isHealthNav
                        ? `${nav.label} — ${systemHealthNav.primary}`
                        : `${nav.label} — ${licenseNavStatus.primary}${licenseNavStatus.secondary ? ` (${licenseNavStatus.secondary})` : ""}`
                      : locked
                        ? "Activate a license key first"
                        : nav.label
                  }
                >
                  {isLicenseNav ? (
                    <div className={`flex ${isNavCollapsed ? "flex-col items-center gap-1" : "items-start gap-3"} w-full`}>
                      <Icon className={`w-4 h-4 shrink-0 ${nav.color}`} />
                      {!isNavCollapsed ? (
                        <div className="min-w-0 flex-1 text-left normal-case tracking-normal">
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-inherit">
                            <span>{nav.label}</span>
                            {locked && <Lock className="w-3 h-3 text-zinc-600" />}
                          </div>
                          <p className={`mt-1 text-[10px] font-bold leading-tight ${statusToneClass}`}>
                            {licenseNavStatus.primary}
                            {licenseNavStatus.secondary ? (
                              <span className="text-zinc-500 font-semibold normal-case"> · {licenseNavStatus.secondary}</span>
                            ) : null}
                          </p>
                        </div>
                      ) : (
                        <span className={`text-[8px] font-bold leading-none ${statusToneClass}`}>
                          {licenseNavStatus.tone === "active" ? "ON" : licenseNavStatus.tone === "inactive" ? "OFF" : "…"}
                        </span>
                      )}
                    </div>
                  ) : isHealthNav ? (
                    <div className={`flex ${isNavCollapsed ? "flex-col items-center gap-1" : "items-start gap-3"} w-full`}>
                      <div className="relative shrink-0">
                        <Icon className={`w-4 h-4 ${nav.color}`} />
                        <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${statusBadgeClass(systemHealthNav.status)}`} />
                      </div>
                      {!isNavCollapsed ? (
                        <div className="min-w-0 flex-1 text-left normal-case tracking-normal">
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-inherit">
                            <span>{nav.label}</span>
                            {locked && <Lock className="w-3 h-3 text-zinc-600" />}
                          </div>
                          <div className={`mt-1.5 flex items-center gap-2 min-w-0 ${healthNavStatusClass(systemHealthNav.status)}`}>
                            <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${statusBadgeClass(systemHealthNav.status)}`} />
                            <p className={`text-[10px] font-bold leading-tight truncate ${healthToneClass}`}>
                              {systemHealthNav.primary}
                              {systemHealthNav.secondary ? (
                                <span className="text-zinc-500 font-semibold normal-case"> · {systemHealthNav.secondary}</span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusBadgeClass(systemHealthNav.status)} ${healthNavStatusClass(systemHealthNav.status)}`} />
                      )}
                    </div>
                  ) : (
                    <>
                      <Icon className={`w-4 h-4 ${nav.color}`} />
                      {!isNavCollapsed && (
                        <span className="flex items-center gap-2">
                          {nav.label}
                          {locked && <Lock className="w-3 h-3 text-zinc-600" />}
                        </span>
                      )}
                    </>
                  )}
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
          activeTab === "tables" || activeTab === "system-health" ? "overflow-hidden" : "overflow-y-auto"
        }`}
        id="main-content-canvas"
      >
        {!dataReady && (
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm font-bold uppercase tracking-wider">
            Loading tournament data...
          </div>
        )}
        {dataReady && activeTab === "clock" && isLicensed && (
          <ClockView
            pendingFullscreen={pendingClockFullscreen}
            onFullscreenHandled={() => setPendingClockFullscreen(false)}
          />
        )}
        {dataReady && activeTab === "display" && isLicensed && <DisplayView onLaunchClockFullscreen={handleLaunchClockFullscreen} />}
        {dataReady && activeTab === "license" && <LicenseView />}
        {dataReady && activeTab === "settings" && isLicensed && <SettingsView />}
        {dataReady && activeTab === "players" && isLicensed && <PlayersView />}
        {dataReady && activeTab === "tables" && isLicensed && <TablesView />}
        {dataReady && activeTab === "dealer-control" && isLicensed && <DealerControlView />}
        {dataReady && activeTab === "system-health" && isLicensed && <SystemHealthView />}
        {dataReady && activeTab === "reports" && isLicensed && <ReportsView />}
        {!licenseLoading && !isLicensed && activeTab !== "license" && <LicenseView />}
      </main>

      </div>
    </div>
  );
}
