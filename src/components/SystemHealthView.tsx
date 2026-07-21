import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Check, ChevronDown, ChevronUp, Cpu, Shield } from "lucide-react";
import { localApi } from "../config/api";
import { statusBadgeClass, toneClass } from "../systemHealth/useSystemHealthNavStatus";

type HealthSnapshot = {
  generatedAt: number;
  status: "green" | "yellow" | "orange" | "red";
  nav: { primary: string; secondary?: string; tone: string };
  uptimeMs: number;
  persistence: string;
  autoProtection: {
    enabled: boolean;
    level: number;
    values: Record<string, number>;
    normalValues: Record<string, number>;
  };
  devices: {
    openTables: number;
    dealerTablets: number;
    dealerPhones: number;
    floorPhones: number;
    qrPhones: number;
    wsClients: number;
  };
  host: {
    cpuPercent: number;
    ramUsedMb: number;
    ramTotalMb: number;
    ramPercent: number;
    eventLoopLagMs: number;
  };
  traffic: {
    totalReqPerSec: number;
    errorRatePercent: number;
    overallP95Ms: number;
    channels: Array<{ channel: string; reqPerSec: number; p95Ms: number }>;
  };
  recommendations: string[];
  recentActions: Array<{ at: number; action: string; reason: string; expectedEffect: string }>;
};

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function channelLabel(channel: string): string {
  switch (channel) {
    case "dealerTablet": return "Dealer tablet";
    case "dealerPhone": return "Dealer phone";
    case "dealerControl": return "Dealer Control";
    case "tracking": return "QR tracking";
    case "floor": return "Floor phone";
    case "display": return "Display";
    default: return "Other";
  }
}

const SPARKLINE_LEN = 14;
const SPARKLINE_INTERVAL_MS = 30_000;
const SPARKLINE_WIDTH = 84;
const SPARKLINE_HEIGHT = 26;
const SPARKLINE_CPU_MAX = 90;
const SPARKLINE_REQ_MAX = 35;

function MiniSparkline({
  values,
  tone = "cyan",
  maxValue,
}: {
  values: number[];
  tone?: "cyan" | "emerald";
  maxValue: number;
}) {
  const stroke = tone === "emerald" ? "#34d399" : "#22d3ee";
  const fill = tone === "emerald" ? "rgba(52,211,153,0.18)" : "rgba(34,211,238,0.18)";

  const points = values.length > 0 ? values : [0, 0];
  const padding = 2;
  const innerHeight = SPARKLINE_HEIGHT - padding * 2;
  const innerWidth = SPARKLINE_WIDTH - padding * 2;
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const limitY = padding;

  const coords = points.map((value, index) => {
    const x = padding + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const normalized = value / scaleMax;
    const y = padding + innerHeight - normalized * innerHeight;
    return { x, y };
  });

  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = coords.length > 1
    ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(SPARKLINE_HEIGHT - padding).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(SPARKLINE_HEIGHT - padding).toFixed(1)} Z`
    : "";
  const lastPoint = coords[coords.length - 1];

  return (
    <svg
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      className="overflow-visible"
      aria-hidden
    >
      <line
        x1={padding}
        y1={limitY}
        x2={SPARKLINE_WIDTH - padding}
        y2={limitY}
        stroke="#ef4444"
        strokeWidth="1.25"
        strokeDasharray="4 2"
        opacity={0.95}
      />
      {areaPath ? <path d={areaPath} fill={fill} stroke="none" /> : null}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={values.length >= 2 ? 0.95 : 0.35}
      />
      {values.length >= 1 ? (
        <circle cx={lastPoint.x} cy={lastPoint.y} r="2.25" fill={stroke} opacity={0.95} />
      ) : null}
    </svg>
  );
}

function KpiBadge({
  label,
  value,
  sparkline,
}: {
  label: string;
  value: React.ReactNode;
  sparkline?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2 min-h-[2rem]">
        <div className="text-xl font-black text-zinc-100 leading-none shrink-0">{value}</div>
        {sparkline ? <div className="pb-0.5 shrink min-w-0 overflow-hidden">{sparkline}</div> : null}
      </div>
    </div>
  );
}

function HeaderStatusBadge({
  title,
  statusLabel,
  active,
  accent = "emerald",
  detail,
}: {
  title: string;
  statusLabel: string;
  active: boolean;
  accent?: "emerald" | "orange" | "amber" | "red";
  detail?: string;
}) {
  const accentStyles = {
    emerald: {
      border: "border-emerald-500/40",
      bg: "bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-zinc-950/80",
      glow: "shadow-[0_0_24px_rgba(16,185,129,0.12)]",
      icon: "text-emerald-400",
      label: "text-emerald-300",
    },
    orange: {
      border: "border-orange-500/40",
      bg: "bg-gradient-to-br from-orange-500/15 via-orange-500/5 to-zinc-950/80",
      glow: "shadow-[0_0_24px_rgba(249,115,22,0.14)]",
      icon: "text-orange-400",
      label: "text-orange-300",
    },
    amber: {
      border: "border-amber-500/40",
      bg: "bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-zinc-950/80",
      glow: "shadow-[0_0_24px_rgba(245,158,11,0.12)]",
      icon: "text-amber-400",
      label: "text-amber-300",
    },
    red: {
      border: "border-red-500/40",
      bg: "bg-gradient-to-br from-red-500/15 via-red-500/5 to-zinc-950/80",
      glow: "shadow-[0_0_24px_rgba(239,68,68,0.14)]",
      icon: "text-red-400",
      label: "text-red-300",
    },
  }[accent];

  return (
    <div
      className={`flex-1 min-w-[220px] rounded-2xl border px-5 py-4 ${accentStyles.border} ${accentStyles.bg} ${accentStyles.glow}`}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{title}</div>
      <div className={`mt-2 flex items-center gap-2 text-base font-black uppercase tracking-wide ${accentStyles.label}`}>
        {active ? <Check className={`w-5 h-5 shrink-0 ${accentStyles.icon}`} strokeWidth={3} /> : null}
        <span>{statusLabel}</span>
      </div>
      {detail ? <p className="mt-1.5 text-[11px] font-semibold text-zinc-400 normal-case tracking-normal">{detail}</p> : null}
    </div>
  );
}

function StatusHero({
  snapshot,
  cpuHistory,
  reqHistory,
}: {
  snapshot: HealthSnapshot | null;
  cpuHistory: number[];
  reqHistory: number[];
}) {
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <p className="text-sm text-zinc-400">Loading system health...</p>
      </div>
    );
  }

  const statusText = {
    green: "Safe to operate — venue load is within normal range",
    yellow: "Load rising — auto protection is watching",
    orange: "High load — device refresh may be slowed",
    red: "Critical load — do not add new devices",
  }[snapshot.status];

  const engineAccent =
    snapshot.status === "red" ? "red" : snapshot.status === "orange" ? "orange" : snapshot.status === "yellow" ? "amber" : "emerald";

  const engineLabel =
    snapshot.status === "red"
      ? "Under Stress"
      : snapshot.status === "orange"
        ? "Optimizing"
        : "Running Normally";

  const protectionAccent =
    snapshot.status === "red"
      ? "red"
      : snapshot.status === "orange"
        ? "orange"
        : snapshot.autoProtection.level > 0
          ? "amber"
          : "emerald";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HeaderStatusBadge
          title="Auto Protection"
          statusLabel="Active"
          active
          accent={protectionAccent}
          detail={
            snapshot.autoProtection.level > 0
              ? `Level ${snapshot.autoProtection.level} — slowing device refresh to protect the server`
              : "Standing by — will adjust device refresh when load rises"
          }
        />
        <HeaderStatusBadge
          title="Core Tournament Engine"
          statusLabel={engineLabel}
          active={snapshot.status !== "red"}
          accent={engineAccent}
          detail={`Uptime ${formatUptime(snapshot.uptimeMs)} · ${snapshot.persistence} storage`}
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 border-t border-zinc-800/80 pt-5">
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 h-3 w-3 rounded-full ${statusBadgeClass(snapshot.status)}`} />
          <div>
            <h2 className={`text-lg font-black uppercase tracking-wide ${toneClass(snapshot.status)}`}>
              {snapshot.nav.primary}
            </h2>
            <p className="text-sm text-emerald-400/90 mt-1.5 font-medium">
              System is automatically optimizing performance when needed.
            </p>
            <p className="text-sm text-zinc-400 mt-1">{statusText}</p>
            {snapshot.nav.secondary ? (
              <p className="text-xs text-zinc-500 mt-1">{snapshot.nav.secondary}</p>
            ) : null}
          </div>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <div>Updated {formatTime(snapshot.generatedAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBadge
          label="Total devices"
          value={snapshot.devices.dealerTablets + snapshot.devices.dealerPhones + snapshot.devices.floorPhones + snapshot.devices.qrPhones}
        />
        <KpiBadge
          label="Requests/sec"
          value={snapshot.traffic.totalReqPerSec}
          sparkline={<MiniSparkline values={reqHistory} tone="cyan" maxValue={SPARKLINE_REQ_MAX} />}
        />
        <KpiBadge
          label="CPU"
          value={`${snapshot.host.cpuPercent}%`}
          sparkline={<MiniSparkline values={cpuHistory} tone="emerald" maxValue={SPARKLINE_CPU_MAX} />}
        />
        <KpiBadge
          label="Host Memory"
          value={`${snapshot.host.ramUsedMb}/${snapshot.host.ramTotalMb} MB`}
        />
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-800/30 transition"
      >
        <span className="text-xs font-black uppercase tracking-wider text-zinc-200">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </div>
  );
}

export default function SystemHealthView() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [reqHistory, setReqHistory] = useState<number[]>([]);
  const lastSparklineSampleAt = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(localApi("/api/admin/system-health"));
      if (!response.ok) throw new Error("System health unavailable");
      const data = (await response.json()) as HealthSnapshot;
      setSnapshot(data);

      const now = Date.now();
      const shouldSampleSparkline =
        lastSparklineSampleAt.current === 0
        || now - lastSparklineSampleAt.current >= SPARKLINE_INTERVAL_MS;

      if (shouldSampleSparkline) {
        lastSparklineSampleAt.current = now;
        setCpuHistory((prev) => [...prev.slice(-(SPARKLINE_LEN - 1)), data.host.cpuPercent]);
        setReqHistory((prev) => [...prev.slice(-(SPARKLINE_LEN - 1)), data.traffic.totalReqPerSec]);
      }

      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load system health");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const topChannels = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.traffic.channels]
      .filter((row) => row.reqPerSec > 0)
      .sort((a, b) => b.reqPerSec - a.reqPerSec)
      .slice(0, 5);
  }, [snapshot]);

  const tuningRows = useMemo(() => {
    if (!snapshot) return [];
    const labels: Record<string, string> = {
      dealerTabletPollMs: "Dealer tablet",
      dealerPhonePollMs: "Dealer phone",
      dealerControlPollMs: "Dealer Control",
      trackingPollMs: "QR tracking",
      floorPollMs: "Floor phone",
    };
    return Object.entries(labels).map(([key, label]) => ({
      label,
      normal: snapshot.autoProtection.normalValues[key],
      current: snapshot.autoProtection.values[key],
    }));
  }, [snapshot]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Shield className="w-7 h-7 text-emerald-400" />
          <Cpu className="w-3.5 h-3.5 text-cyan-400 absolute -bottom-0.5 -right-0.5" />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-zinc-100">
            System Health Auto Protection
          </h1>
          <p className="text-sm text-zinc-500">Live venue monitoring with automatic performance optimization</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <StatusHero snapshot={snapshot} cpuHistory={cpuHistory} reqHistory={reqHistory} />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
        <div className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <Activity className="w-4 h-4" /> System Message
        </div>
        <ul className="space-y-1.5 text-sm text-zinc-300">
          {(snapshot?.recommendations?.length ? snapshot.recommendations : [
            "All systems operational. Auto Protection is active and monitoring venue load.",
          ]).map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>
      </div>

      <CollapsibleSection title="Connected devices">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">Count</th>
              </tr>
            </thead>
            <tbody className="text-zinc-200">
              <tr className="border-b border-zinc-800/60"><td className="py-2">Open tables</td><td>{snapshot?.devices.openTables ?? "—"}</td></tr>
              <tr className="border-b border-zinc-800/60"><td className="py-2">Dealer tablets</td><td>{snapshot?.devices.dealerTablets ?? "—"}</td></tr>
              <tr className="border-b border-zinc-800/60"><td className="py-2">Dealer phones</td><td>{snapshot?.devices.dealerPhones ?? "—"}</td></tr>
              <tr className="border-b border-zinc-800/60"><td className="py-2">Floor phones</td><td>{snapshot?.devices.floorPhones ?? "—"}</td></tr>
              <tr className="border-b border-zinc-800/60"><td className="py-2">QR phones</td><td>{snapshot?.devices.qrPhones ?? "—"}</td></tr>
              <tr><td className="py-2">WebSocket clients</td><td>{snapshot?.devices.wsClients ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <div className="grid md:grid-cols-2 gap-5">
        <CollapsibleSection title="Host Computer">
          <div className="space-y-2 text-sm text-zinc-300">
            <div className="flex justify-between"><span>CPU</span><span>{snapshot?.host.cpuPercent ?? "—"}%</span></div>
            <div className="flex justify-between"><span>Host Memory</span><span>{snapshot?.host.ramPercent ?? "—"}% <span className="text-zinc-500 text-xs">(info)</span></span></div>
            <div className="flex justify-between"><span>Response lag</span><span>{snapshot ? `${snapshot.host.eventLoopLagMs} ms` : "—"}</span></div>
            <div className="flex justify-between"><span>Storage</span><span>{snapshot?.persistence ?? "—"}</span></div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Network Activity">
          <div className="space-y-2 text-sm text-zinc-300">
            <div className="flex justify-between"><span>Total req/s</span><span>{snapshot?.traffic.totalReqPerSec ?? "—"}</span></div>
            <div className="flex justify-between"><span>Overall p95</span><span>{snapshot ? formatMs(snapshot.traffic.overallP95Ms) : "—"}</span></div>
            <div className="flex justify-between"><span>Error rate</span><span>{snapshot?.traffic.errorRatePercent ?? "—"}%</span></div>
            {topChannels.map((row) => (
              <div key={row.channel} className="flex justify-between text-zinc-400">
                <span>{channelLabel(row.channel)}</span>
                <span>{row.reqPerSec}/s · p95 {formatMs(row.p95Ms)}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>

      <CollapsibleSection title="Refresh intervals" defaultOpen={Boolean(snapshot && snapshot.autoProtection.level > 0)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">Normal</th>
                <th className="py-2">Now</th>
              </tr>
            </thead>
            <tbody>
              {tuningRows.map((row) => (
                <tr key={row.label} className="border-b border-zinc-800/60 text-zinc-200">
                  <td className="py-2">{row.label}</td>
                  <td className="py-2">{formatMs(row.normal ?? 0)}</td>
                  <td className={`py-2 ${row.current > row.normal ? "text-orange-300 font-bold" : ""}`}>
                    {formatMs(row.current ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Auto protection log" defaultOpen={Boolean(snapshot?.recentActions?.length)}>
        {!snapshot?.recentActions?.length ? (
          <p className="text-sm text-zinc-500">No automatic changes yet — system is monitoring.</p>
        ) : (
          <div className="space-y-3">
            {snapshot.recentActions.map((entry) => (
              <div key={`${entry.at}-${entry.action}`} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                <div className="flex justify-between gap-4 text-zinc-400 text-xs">
                  <span>{formatTime(entry.at)}</span>
                </div>
                <div className="text-zinc-100 font-semibold mt-1">{entry.action}</div>
                <div className="text-zinc-400 mt-1">{entry.reason}</div>
                <div className="text-emerald-400/90 text-xs mt-1">{entry.expectedEffect}</div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
