/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  DISPLAY_PRESETS,
  DEFAULT_DISPLAY_SETTINGS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  DisplaySettings,
  calcDisplayScale,
  getDisplaySettings,
  saveDisplaySettings,
} from "../displaySettings";
import { fetchVenueDisplayUrl, type VenueDisplayUrlInfo } from "../venue/venueDisplayUrl";
import { Monitor, Maximize2, Save, RotateCcw, Ruler, Tv, Copy, ExternalLink, RefreshCw } from "lucide-react";

interface DisplayViewProps {
  onLaunchClockFullscreen: () => void;
}

export default function DisplayView({ onLaunchClockFullscreen }: DisplayViewProps) {
  const [settings, setSettings] = useState<DisplaySettings>(getDisplaySettings());
  const [customWidth, setCustomWidth] = useState(String(settings.targetWidth));
  const [customHeight, setCustomHeight] = useState(String(settings.targetHeight));
  const [savedToast, setSavedToast] = useState(false);
  const [venueUrlInfo, setVenueUrlInfo] = useState<VenueDisplayUrlInfo | null>(null);
  const [venueUrlLoading, setVenueUrlLoading] = useState(true);
  const [copyToast, setCopyToast] = useState(false);

  const refreshVenueUrl = useCallback(async () => {
    setVenueUrlLoading(true);
    const info = await fetchVenueDisplayUrl();
    setVenueUrlInfo(info);
    setVenueUrlLoading(false);
  }, []);

  useEffect(() => {
    void refreshVenueUrl();
    const interval = window.setInterval(() => {
      void refreshVenueUrl();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refreshVenueUrl]);

  useEffect(() => {
    setCustomWidth(String(settings.targetWidth));
    setCustomHeight(String(settings.targetHeight));
  }, [settings.targetWidth, settings.targetHeight]);

  const previewScale = useMemo(
    () => calcDisplayScale(settings.targetWidth, settings.targetHeight, settings),
    [settings]
  );

  const applyPreset = (presetId: string) => {
    const preset = DISPLAY_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    const next: DisplaySettings = {
      targetWidth: preset.width,
      targetHeight: preset.height,
      presetId: preset.id,
      presetName: preset.name,
    };
    setSettings(next);
    setCustomWidth(String(preset.width));
    setCustomHeight(String(preset.height));
  };

  const applyCustomResolution = () => {
    const width = Math.max(640, Math.min(7680, Number(customWidth) || DESIGN_WIDTH));
    const height = Math.max(480, Math.min(4320, Number(customHeight) || DESIGN_HEIGHT));
    const next: DisplaySettings = {
      targetWidth: width,
      targetHeight: height,
      presetId: "custom",
      presetName: "Custom",
    };
    setSettings(next);
    setCustomWidth(String(width));
    setCustomHeight(String(height));
  };

  const handleSave = () => {
    const width = Math.max(640, Math.min(7680, Number(customWidth) || settings.targetWidth));
    const height = Math.max(480, Math.min(4320, Number(customHeight) || settings.targetHeight));
    const next: DisplaySettings = {
      ...settings,
      targetWidth: width,
      targetHeight: height,
      presetId: settings.presetId === "custom" ? "custom" : settings.presetId,
      presetName: settings.presetId === "custom" ? "Custom" : settings.presetName,
    };
    saveDisplaySettings(next);
    setSettings(next);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  const handleReset = () => {
    const next = { ...DEFAULT_DISPLAY_SETTINGS };
    saveDisplaySettings(next);
    setSettings(next);
    setCustomWidth(String(next.targetWidth));
    setCustomHeight(String(next.targetHeight));
  };

  const handleCopyVenueUrl = async () => {
    if (!venueUrlInfo?.url) return;
    try {
      await navigator.clipboard.writeText(venueUrlInfo.url);
      setCopyToast(true);
      window.setTimeout(() => setCopyToast(false), 2000);
    } catch {
      window.prompt("Copy venue display URL:", venueUrlInfo.url);
    }
  };

  const openVenueDisplayPreview = () => {
    if (!venueUrlInfo?.url) return;
    window.open(venueUrlInfo.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Monitor className="w-6 h-6 text-cyan-400" />
              <h1 className="text-2xl font-black uppercase tracking-wider">Display Manager</h1>
            </div>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Output modules for venue TVs and projectors. Save your screen profile, then open the Smart TV browser at the venue display URL below (menu-free clock only).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={onLaunchClockFullscreen}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 text-xs font-black uppercase tracking-wider flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
            >
              <Maximize2 className="w-4 h-4" />
              Clock Fullscreen
            </button>
          </div>
        </div>

        <section className="bg-cyan-500/5 border border-cyan-500/25 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Monitor className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-100">Venue Display URL (Smart TV)</h2>
              </div>
              <p className="text-xs text-zinc-400 max-w-3xl">
                Enter this address in the TV browser on the same Wi‑Fi/LAN. IP updates automatically when the venue PC network changes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshVenueUrl()}
              className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${venueUrlLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm text-cyan-300 break-all">
              {venueUrlLoading && !venueUrlInfo ? "Detecting LAN address…" : venueUrlInfo?.url ?? "Could not detect venue URL"}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!venueUrlInfo?.url}
                onClick={() => void handleCopyVenueUrl()}
                className="px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-cyan-500/40 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition disabled:opacity-50"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                type="button"
                disabled={!venueUrlInfo?.url}
                onClick={openVenueDisplayPreview}
                className="px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition disabled:opacity-50"
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </button>
            </div>
          </div>

          {venueUrlInfo?.addresses && venueUrlInfo.addresses.length > 1 ? (
            <p className="text-[11px] text-zinc-500">
              Detected LAN IPs: {venueUrlInfo.addresses.join(", ")} — primary used above.
            </p>
          ) : null}

          <p className="text-[11px] text-zinc-500 max-w-3xl">
            On the TV: press <span className="text-zinc-400">OK</span> on the remote once to enter full screen.
            If your TV supports it, add this page to the home screen — it opens without the browser address bar.
          </p>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Tv className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200">Screen Modules</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DISPLAY_PRESETS.map((preset) => {
                  const active = settings.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={`text-left rounded-xl border p-4 transition ${
                        active
                          ? "border-cyan-500/60 bg-cyan-500/10 shadow-[inset_0_0_20px_rgba(34,211,238,0.08)]"
                          : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-black uppercase tracking-wide text-zinc-100">{preset.name}</span>
                        <span className="text-[10px] font-mono text-cyan-400">{preset.label}</span>
                      </div>
                      <p className="text-xs text-zinc-500">{preset.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Ruler className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200">Custom Resolution</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Width (px)</label>
                  <input
                    type="number"
                    min={640}
                    max={7680}
                    value={customWidth}
                    onChange={(e) => {
                      setCustomWidth(e.target.value);
                      setSettings((prev) => ({ ...prev, presetId: "custom", presetName: "Custom" }));
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:border-cyan-500/50 outline-none"
                  />
                </div>
                <span className="hidden sm:block text-zinc-600 font-black pb-3">×</span>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Height (px)</label>
                  <input
                    type="number"
                    min={480}
                    max={4320}
                    value={customHeight}
                    onChange={(e) => {
                      setCustomHeight(e.target.value);
                      setSettings((prev) => ({ ...prev, presetId: "custom", presetName: "Custom" }));
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:border-cyan-500/50 outline-none"
                  />
                </div>
                <button
                  onClick={applyCustomResolution}
                  className="px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-zinc-500 text-xs font-bold uppercase tracking-wider transition"
                >
                  Apply
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-3">
                Design canvas is {DESIGN_WIDTH}×{DESIGN_HEIGHT}px. Content auto-fits to the selected screen in fullscreen mode.
              </p>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200 mb-4">Active Profile</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-500">Module</span>
                  <span className="font-bold text-zinc-100">{settings.presetName}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-500">Target Resolution</span>
                  <span className="font-mono text-cyan-400">{settings.targetWidth} × {settings.targetHeight}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-500">Design Canvas</span>
                  <span className="font-mono text-zinc-300">{DESIGN_WIDTH} × {DESIGN_HEIGHT}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Scale Ratio</span>
                  <span className="font-mono text-amber-400">{(previewScale * 100).toFixed(1)}%</span>
                </div>
              </div>
            </section>

            <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200 mb-4">Preview</h2>
              <div
                className="relative mx-auto rounded-xl border border-zinc-700 bg-black overflow-hidden"
                style={{
                  width: "100%",
                  maxWidth: 320,
                  aspectRatio: `${settings.targetWidth} / ${settings.targetHeight}`,
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                  <div
                    className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
                    style={{
                      width: DESIGN_WIDTH * previewScale * 0.16,
                      height: DESIGN_HEIGHT * previewScale * 0.16,
                    }}
                  >
                    <div className="w-full h-full p-2 flex flex-col gap-1">
                      <div className="h-2 bg-zinc-800 rounded" />
                      <div className="flex-1 grid grid-cols-3 gap-1">
                        <div className="bg-zinc-800/80 rounded" />
                        <div className="bg-amber-500/20 border border-amber-500/30 rounded" />
                        <div className="bg-zinc-800/80 rounded" />
                      </div>
                      <div className="h-3 bg-zinc-800 rounded" />
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 mt-3 text-center">
                In fullscreen mode, content is centered with no overflow or scrolling.
              </p>
            </section>
          </div>
        </div>
      </div>

      {copyToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-cyan-500 text-black px-5 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2">
          <Copy className="w-4 h-4" />
          Venue URL copied
        </div>
      )}

      {savedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-black px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/10 flex items-center gap-2">
          <Save className="w-4 h-4" />
          Display settings saved
        </div>
      )}
    </div>
  );
}
