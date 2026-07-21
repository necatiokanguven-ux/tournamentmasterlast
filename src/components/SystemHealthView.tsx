import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Settings,
  Shield,
  ShieldCheck,
  X,
} from "lucide-react";
import { localApi } from "../config/api";

type VenueDeviceMode = "on" | "limited" | "off";

type HealthSnapshot = {
  generatedAt: number;
  status: "green" | "yellow" | "orange" | "red";
  nav: { primary: string; secondary?: string; tone: string };
  uptimeMs: number;
  persistence: string;
  evaluation: {
    inGracePeriod: boolean;
    graceRemainingMs: number;
    hasVenueLoad: boolean;
    p95Reliable: boolean;
    triggers: string[];
  };
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
    totalRequestCount: number;
    errorRatePercent: number;
    overallP95Ms: number;
    p95Reliable: boolean;
    channels: Array<{ channel: string; reqPerSec: number; p95Ms: number; p95Reliable?: boolean }>;
  };
  recommendations: string[];
  recentActions: Array<{ at: number; action: string; reason: string; expectedEffect: string }>;
  venueDeviceMode: VenueDeviceMode;
};

const GAUGE_W = 58;
const GAUGE_H = 42;
const REQ_GAUGE_MAX = 48;
const CPU_GAUGE_MAX = 100;
const PANEL_REFRESH_MS = 3_000;
const DEVICE_BAR_MAX = 40;
const CONTENT_MAX_W = 920;
const HEADER_BADGE_W = 220;
const HEADER_BADGE_H = 72;
const HEADER_BADGE_COMPACT_W = 156;
const INFO_ROW_H = 26;
const INFO_HEADER_H = 24;
const INFO_PAD_Y = 32;

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

type GaugeZone = { to: number; color: string };

function describeGaugeArc(cx: number, cy: number, r: number, fromRatio: number, toRatio: number): string {
  const a1 = Math.PI * (1 - fromRatio);
  const a2 = Math.PI * (1 - toRatio);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy - r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy - r * Math.sin(a2);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function MiniGauge({
  value,
  maxValue,
  zones,
}: {
  value: number;
  maxValue: number;
  zones: GaugeZone[];
}) {
  const cx = GAUGE_W / 2;
  const cy = GAUGE_H - 2;
  const r = 23;
  const trackWidth = 5;

  const safeValue = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(0, Math.min(maxValue, safeValue));
  const ratio = maxValue > 0 ? clamped / maxValue : 0;
  const needleAngle = Math.PI * (1 - ratio);
  const needleLen = r - 3;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);

  let prev = 0;
  const segments = zones.map((zone) => {
    const from = prev / maxValue;
    const to = zone.to / maxValue;
    prev = zone.to;
    return { from, to, color: zone.color };
  });

  return (
    <svg width={GAUGE_W} height={GAUGE_H} viewBox={`0 0 ${GAUGE_W} ${GAUGE_H}`} aria-hidden>
      <path
        d={describeGaugeArc(cx, cy, r, 0, 1)}
        fill="none"
        stroke="#1F2937"
        strokeWidth={trackWidth + 1.5}
        strokeLinecap="butt"
      />
      {segments.map((seg, index) => (
        <path
          key={`${seg.color}-${index}`}
          d={describeGaugeArc(cx, cy, r, seg.from, seg.to)}
          fill="none"
          stroke={seg.color}
          strokeWidth={trackWidth}
          strokeLinecap="butt"
          opacity={0.92}
        />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#F9FAFB" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill="#374151" stroke="#9CA3AF" strokeWidth="0.75" />
      <circle cx={cx} cy={cy} r="1.25" fill="#D1D5DB" />
    </svg>
  );
}

const REQ_GAUGE_ZONES: GaugeZone[] = [
  { to: 12, color: "#10B981" },
  { to: 22, color: "#F59E0B" },
  { to: 38, color: "#FB923C" },
  { to: 48, color: "#EF4444" },
];

const CPU_GAUGE_ZONES: GaugeZone[] = [
  { to: 50, color: "#10B981" },
  { to: 70, color: "#F59E0B" },
  { to: 85, color: "#FB923C" },
  { to: 100, color: "#EF4444" },
];

function CornerStatusBar({
  ratio,
  critical,
  warning,
}: {
  ratio: number;
  critical?: boolean;
  warning?: boolean;
}) {
  const pct = Math.min(100, Math.max(4, ratio));
  const color = critical ? "#EF4444" : warning ? "#F59E0B" : "#10B981";
  return (
    <div
      className="absolute top-2 right-2 w-12 h-1.5 rounded-full overflow-hidden"
      style={{ background: "#1F2937" }}
      aria-hidden
    >
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  critical,
  cornerBar,
  gauge,
}: {
  label: string;
  value: React.ReactNode;
  critical?: boolean;
  cornerBar?: React.ReactNode;
  gauge?: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-md border px-3 py-2 min-w-0"
      style={{
        background: critical ? "rgba(69, 10, 10, 0.35)" : "rgba(17, 19, 30, 0.6)",
        borderColor: critical ? "#EF4444" : "#1F2335",
        height: 68,
      }}
    >
      {cornerBar}
      {gauge ? <div className="absolute bottom-0.5 right-1">{gauge}</div> : null}
      <div className="text-[10px] uppercase tracking-wider text-[#6B7280] mb-1 pr-14">{label}</div>
      <div className="text-lg font-bold text-white leading-none pr-16">{value}</div>
    </div>
  );
}

function HeaderStatusBlock({
  title,
  statusLabel,
  detail,
  tone = "emerald",
  compact,
  largeStatusDot,
  cornerIcon,
}: {
  title: string;
  statusLabel: string;
  detail?: string;
  tone?: "emerald" | "amber" | "orange" | "red";
  compact?: boolean;
  largeStatusDot?: boolean;
  cornerIcon?: React.ReactNode;
}) {
  const tones = {
    emerald: { bg: "#064E3B", text: "#6EE7B7", border: "#10B981", dot: "#34D399", title: "#D1D5DB", detail: "#E5E7EB" },
    amber: { bg: "#451A03", text: "#FCD34D", border: "#F59E0B", dot: "#FBBF24", title: "#D1D5DB", detail: "#FEF3C7" },
    orange: { bg: "#431407", text: "#FDBA74", border: "#FB923C", dot: "#FB923C", title: "#D1D5DB", detail: "#FFEDD5" },
    red: { bg: "#450A0A", text: "#FCA5A5", border: "#EF4444", dot: "#F87171", title: "#D1D5DB", detail: "#FEE2E2" },
  }[tone];

  const width = compact ? HEADER_BADGE_COMPACT_W : HEADER_BADGE_W;

  return (
    <div
      className="relative rounded-md px-3 py-2 flex flex-col shrink-0 overflow-hidden"
      style={{
        width,
        height: HEADER_BADGE_H,
        background: compact ? "transparent" : tones.bg,
        border: `1px solid ${tones.border}`,
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      }}
    >
      {cornerIcon ? (
        <div className="absolute top-2 right-2 opacity-85" style={{ color: tones.border }}>
          {cornerIcon}
        </div>
      ) : null}
      <div
        className="text-[10px] font-bold uppercase tracking-wider truncate pr-5"
        style={{ color: compact ? "#CBD5E1" : tones.title }}
      >
        {title}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold min-h-[16px]" style={{ color: tones.text }}>
        <span
          className={`inline-block rounded-full shrink-0 ${largeStatusDot ? "w-[15px] h-[15px]" : "w-1.5 h-1.5"}`}
          style={{ background: tones.dot }}
        />
        <span className="truncate">{statusLabel}</span>
      </div>
      {detail ? (
        <p
          className="mt-1 text-[10px] leading-snug line-clamp-2 flex-1 font-medium"
          style={{ color: tones.detail, opacity: compact ? 0.95 : 0.92 }}
        >
          {detail}
        </p>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

function VenueDeviceModeSwitch({
  value,
  onChange,
}: {
  value: VenueDeviceMode;
  onChange: (mode: VenueDeviceMode) => void;
}) {
  const options: Array<{ id: VenueDeviceMode; label: string; activeClass: string }> = [
    { id: "on", label: "ON", activeClass: "bg-emerald-600 text-white" },
    { id: "limited", label: "LIMITED", activeClass: "bg-amber-500 text-black" },
    { id: "off", label: "OFF", activeClass: "bg-red-600 text-white" },
  ];

  return (
    <div
      className="inline-flex rounded-full border border-[#1F2335] p-0.5 shrink-0"
      style={{ background: "rgba(22, 25, 38, 0.9)" }}
      role="group"
      aria-label="Venue mobile device mode"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wide rounded-full transition-colors min-w-[42px] ${
            value === option.id ? option.activeClass : "text-[#6B7280] hover:text-[#D1D5DB]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function VenueDeviceOffConfirmModal({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }}>
      <div
        className="relative w-full max-w-md rounded-lg border border-[#1F2335] p-5 shadow-2xl"
        style={{ background: "rgba(17, 19, 30, 0.98)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-3 right-3 text-[#9CA3AF] hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-bold text-white pr-6">Disable venue mobile devices?</h3>
        <p className="mt-3 text-[12px] leading-relaxed text-[#D1D5DB]">
          This will disconnect dealer tablets, dealer phones, QR live tracking, and floor phones from the venue network.
          Display TVs and the director console will continue running.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-[#1F2335] text-[12px] font-semibold text-[#D1D5DB] hover:bg-[#1F2335]/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md bg-red-600 text-[12px] font-bold text-white hover:bg-red-500"
          >
            Confirm OFF
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoPanel({
  title,
  dataRowCount,
  children,
  fill,
}: {
  title: string;
  dataRowCount?: number;
  children: React.ReactNode;
  fill?: boolean;
}) {
  if (fill) {
    return (
      <div
        className="flex-1 min-h-0 flex flex-col rounded-lg border border-[#1F2335] px-4 pt-3 pb-3 overflow-hidden"
        style={{ background: "rgba(17, 19, 30, 0.4)" }}
      >
        <h2 className="text-xs font-bold uppercase text-[#9CA3AF] mb-2 tracking-wide shrink-0">{title}</h2>
        <div className="min-h-0 flex-1 flex flex-col justify-start overflow-hidden">{children}</div>
      </div>
    );
  }

  const height = INFO_HEADER_H + (dataRowCount ?? 0) * INFO_ROW_H + INFO_ROW_H + INFO_PAD_Y;
  return (
    <div
      className="shrink-0 rounded-lg border border-[#1F2335] px-4 pt-3 pb-4 overflow-hidden"
      style={{ background: "rgba(17, 19, 30, 0.4)", height }}
    >
      <h2 className="text-xs font-bold uppercase text-[#9CA3AF] mb-2 tracking-wide" style={{ height: INFO_HEADER_H - 8 }}>
        {title}
      </h2>
      <div>{children}</div>
      <div aria-hidden style={{ height: INFO_ROW_H }} />
    </div>
  );
}

function KeyValueRow({
  label,
  value,
  valueClassName = "text-white font-semibold",
  rowCritical,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  rowCritical?: boolean;
}) {
  return (
    <div
      className="flex justify-between items-center text-[13px]"
      style={{
        height: INFO_ROW_H,
        ...(rowCritical ? { background: "rgba(69, 10, 10, 0.2)", margin: "0 -4px", padding: "0 4px", borderRadius: 4 } : undefined),
      }}
    >
      <span className="text-[#6B7280]">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

export default function SystemHealthView() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRefreshMenu, setShowRefreshMenu] = useState(false);
  const [logCopied, setLogCopied] = useState(false);
  const [venueDeviceMode, setVenueDeviceMode] = useState<VenueDeviceMode>("on");
  const [showOffConfirm, setShowOffConfirm] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(localApi("/api/admin/system-health"));
      if (!response.ok) throw new Error("System health unavailable");
      const data = (await response.json()) as HealthSnapshot;
      setSnapshot(data);
      setVenueDeviceMode(data.venueDeviceMode ?? "on");
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load system health");
    }
  }, []);

  const applyVenueDeviceMode = useCallback(async (mode: VenueDeviceMode) => {
    setModeSaving(true);
    try {
      const response = await fetch(localApi("/api/admin/venue-device-mode"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error("Failed to update venue device mode");
      const data = (await response.json()) as { mode: VenueDeviceMode };
      setVenueDeviceMode(data.mode);
      await refresh();
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : "Failed to update venue device mode");
    } finally {
      setModeSaving(false);
    }
  }, [refresh]);

  const handleVenueDeviceModeChange = useCallback((mode: VenueDeviceMode) => {
    if (mode === "off") {
      setShowOffConfirm(true);
      return;
    }
    void applyVenueDeviceMode(mode);
  }, [applyVenueDeviceMode]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), PANEL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const topChannels = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.traffic.channels]
      .filter((row) => row.reqPerSec > 0)
      .sort((a, b) => b.reqPerSec - a.reqPerSec)
      .slice(0, 4);
  }, [snapshot]);

  const totalDevices = snapshot
    ? snapshot.devices.dealerTablets + snapshot.devices.dealerPhones + snapshot.devices.floorPhones + snapshot.devices.qrPhones
    : 0;

  const cpuCritical = (snapshot?.host.cpuPercent ?? 0) > 80;
  const errorCritical = (snapshot?.traffic.errorRatePercent ?? 0) > 5;
  const lagWarning = (snapshot?.host.eventLoopLagMs ?? 0) > 150;

  const protectionTone =
    snapshot?.status === "red" ? "red"
      : snapshot?.status === "orange" ? "orange"
        : (snapshot?.autoProtection.level ?? 0) > 0 ? "amber"
          : snapshot?.evaluation.inGracePeriod ? "amber"
            : "emerald";

  const engineTone =
    snapshot?.status === "red" ? "red"
      : snapshot?.status === "orange" ? "orange"
        : snapshot?.status === "yellow" ? "amber"
          : "emerald";

  const systemTone =
    snapshot?.status === "red" ? "red"
      : snapshot?.status === "orange" ? "orange"
        : snapshot?.status === "yellow" ? "amber"
          : "emerald";

  const protectionStatusLabel = snapshot?.evaluation.inGracePeriod
    ? "Calibrating"
    : (snapshot?.autoProtection.level ?? 0) > 0
      ? `Level ${snapshot?.autoProtection.level} active`
      : "Ready";

  const protectionDetail = snapshot?.evaluation.inGracePeriod
    ? `Startup calibration — ${Math.max(1, Math.ceil((snapshot.evaluation.graceRemainingMs ?? 0) / 60_000))}m remaining`
    : (snapshot?.autoProtection.level ?? 0) > 0
      ? "Slowing device refresh during sustained high load"
      : "Standing by — activates only on sustained high limits";

  const engineStatusLabel =
    snapshot?.status === "red" ? "Under stress"
      : snapshot?.status === "orange" ? "Heavy load"
        : snapshot?.status === "yellow" ? "Elevated load"
          : "Running normally";

  const systemStatusLabel = snapshot?.nav.primary ?? "System normal";

  const dealerTablets = snapshot?.devices.dealerTablets ?? 0;
  const dealerPhones = snapshot?.devices.dealerPhones ?? 0;
  const dealerDeviceMismatch = dealerPhones > 0 && dealerTablets < dealerPhones;

  const deviceRows = [
    { label: "Open tables", count: snapshot?.devices.openTables ?? 0 },
    { label: "Table tablet", count: snapshot?.devices.dealerTablets ?? 0 },
    { label: "Dealer phones", count: snapshot?.devices.dealerPhones ?? 0 },
    { label: "Floor phones", count: snapshot?.devices.floorPhones ?? 0 },
    { label: "QR Live Tracking Player", count: snapshot?.devices.qrPhones ?? 0 },
    { label: "WebSocket clients", count: snapshot?.devices.wsClients ?? 0 },
  ];

  const logEntries = useMemo(() => {
    const actionMsgs = (snapshot?.recentActions ?? []).map((entry) => ({
      key: `act-${entry.at}-${entry.action}`,
      border: entry.action.includes("recovery") || entry.action.includes("→0") ? "#10B981" : "#F59E0B",
      text: `[${formatTime(entry.at)}] ${entry.action} — ${entry.reason}`,
    }));
    const systemMsgs = (snapshot?.recommendations ?? []).map((tip) => ({
      key: `sys-${tip}`,
      border: "#10B981",
      text: `[SYSTEM] ${tip}`,
    }));
    if (actionMsgs.length === 0 && systemMsgs.length === 0) {
      return [{ key: "empty", border: "#10B981", text: "[SYSTEM] No automatic changes yet — monitoring venue load." }];
    }
    return [...actionMsgs, ...systemMsgs];
  }, [snapshot]);

  const logPlainText = useMemo(() => logEntries.map((e) => e.text).join("\n"), [logEntries]);

  const refreshRows = useMemo(() => {
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

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logPlainText);
      setLogCopied(true);
      window.setTimeout(() => setLogCopied(false), 2000);
    } catch {
      setLogCopied(false);
    }
  };

  const deviceBarRatio = Math.min(100, (totalDevices / DEVICE_BAR_MAX) * 100);
  const reqBarRatio = Math.min(100, ((snapshot?.traffic.totalReqPerSec ?? 0) / REQ_GAUGE_MAX) * 100);
  const cpuBarRatio = snapshot?.host.cpuPercent ?? 0;

  if (!snapshot && !error) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[13px] text-zinc-500">
        Loading system health...
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-hidden overflow-x-auto text-[13px] font-sans">
      <div className="min-w-[1440px] h-full flex flex-col gap-3 p-4">
        {error ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] text-red-200 shrink-0">{error}</div>
        ) : null}

        {/* HEADER */}
        <header className="shrink-0 border-b border-[#1F2937] pb-2">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="relative shrink-0 self-start mt-0.5">
              <Shield className="w-7 h-7 text-emerald-400" />
              <Cpu className="w-3.5 h-3.5 text-cyan-400 absolute -bottom-0.5 -right-0.5" />
            </div>
            <div className="shrink-0 pt-0.5">
              <h1 className="text-base font-bold text-white tracking-wide leading-none">
                SYSTEM HEALTH
              </h1>
              <p className="mt-0.5 text-[11px] text-[#9CA3AF] leading-tight">
                Live venue monitoring with automatic
                <br />
                performance optimization
              </p>
            </div>
            <div className="flex items-start gap-2 flex-wrap ml-5 mt-0.5">
              <HeaderStatusBlock
                title="Auto Protection"
                statusLabel={protectionStatusLabel}
                detail={protectionDetail}
                tone={protectionTone}
                cornerIcon={<ShieldCheck className="w-3.5 h-3.5" />}
              />
              <HeaderStatusBlock
                title="Core Tournament Engine"
                statusLabel={engineStatusLabel}
                detail={snapshot ? `Uptime ${formatUptime(snapshot.uptimeMs)} · ${snapshot.persistence} storage` : undefined}
                tone={engineTone}
                cornerIcon={<Settings className="w-3.5 h-3.5" />}
              />
              <HeaderStatusBlock
                title="System Status"
                statusLabel={systemStatusLabel}
                detail={snapshot?.nav.secondary}
                tone={systemTone}
                compact
                largeStatusDot
                cornerIcon={<Activity className="w-3.5 h-3.5" />}
              />
            </div>
          </div>
        </header>

        {/* METRICS — compact 4-column row */}
        <section className="shrink-0 grid grid-cols-4 gap-2 w-full" style={{ maxWidth: CONTENT_MAX_W }}>
          <MetricCard
            label="Total Devices"
            value={totalDevices}
            cornerBar={
              <CornerStatusBar
                ratio={deviceBarRatio}
                warning={totalDevices >= 20}
                critical={totalDevices >= 32}
              />
            }
          />
          <MetricCard
            label="Requests/sec"
            value={snapshot?.traffic.totalReqPerSec ?? "—"}
            critical={errorCritical}
            cornerBar={
              <CornerStatusBar
                ratio={reqBarRatio}
                warning={(snapshot?.traffic.totalReqPerSec ?? 0) >= 22}
                critical={(snapshot?.traffic.totalReqPerSec ?? 0) >= 38}
              />
            }
            gauge={
              <MiniGauge
                value={snapshot?.traffic.totalReqPerSec ?? 0}
                maxValue={REQ_GAUGE_MAX}
                zones={REQ_GAUGE_ZONES}
              />
            }
          />
          <MetricCard
            label="CPU"
            value={`${snapshot?.host.cpuPercent ?? "—"}%`}
            critical={cpuCritical}
            cornerBar={
              <CornerStatusBar
                ratio={cpuBarRatio}
                warning={(snapshot?.host.cpuPercent ?? 0) >= 70}
                critical={cpuCritical}
              />
            }
            gauge={
              <MiniGauge
                value={snapshot?.host.cpuPercent ?? 0}
                maxValue={CPU_GAUGE_MAX}
                zones={CPU_GAUGE_ZONES}
              />
            }
          />
          <MetricCard
            label="Host Memory"
            value={
              <span className="text-[15px]">
                {snapshot ? `${snapshot.host.ramUsedMb}/${snapshot.host.ramTotalMb} MB` : "—"}
              </span>
            }
            cornerBar={
              <CornerStatusBar
                ratio={snapshot?.host.ramPercent ?? 0}
                warning={(snapshot?.host.ramPercent ?? 0) >= 85}
                critical={(snapshot?.host.ramPercent ?? 0) >= 95}
              />
            }
          />
        </section>

        {/* MAIN WORKSPACE — 3 equal columns */}
        <section
          className="flex-1 min-h-0 grid grid-cols-3 gap-3 w-full items-stretch"
          style={{ maxWidth: CONTENT_MAX_W }}
        >
          {/* Column 1: Connected Devices */}
          <div
            className="flex flex-col rounded-lg border border-[#1F2335] p-4 min-h-0 h-full overflow-hidden"
            style={{ background: "rgba(17, 19, 30, 0.4)" }}
          >
            <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
              <h2 className="text-xs font-bold uppercase text-[#9CA3AF] tracking-wide">Connected Devices</h2>
              <VenueDeviceModeSwitch
                value={venueDeviceMode}
                onChange={handleVenueDeviceModeChange}
              />
            </div>
            {venueDeviceMode !== "on" ? (
              <p className="text-[10px] leading-snug text-[#9CA3AF] mb-2 shrink-0">
                {venueDeviceMode === "off"
                  ? "Mobile venue devices disabled — TVs and director continue."
                  : "Limited — no new mobile connections; polls slowed."}
                {modeSaving ? " Updating…" : null}
              </p>
            ) : null}
            <div className="flex-1 min-h-0 flex flex-col justify-start">
              <table className="w-full border-collapse">
                <tbody>
                  {deviceRows.map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-[#1F2335]/50"
                      style={{ height: 28, opacity: row.count === 0 ? 0.45 : 1 }}
                    >
                      <td className="text-[#E5E7EB] py-0">{row.label}</td>
                      <td className="text-right font-bold text-white py-0">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dealerDeviceMismatch ? (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 shrink-0">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 shrink-0 mt-0.5 animate-pulse" />
                  <p className="text-[11px] leading-snug text-red-200 font-semibold">
                    Warning — urgent intervention required: active dealer phone connections ({dealerPhones}) exceed connected table tablets ({dealerTablets}). Counts are inconsistent — verify tablets and dealer phones immediately.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Column 2: Host Computer + Network Activity — same height as column 1 */}
          <div className="flex flex-col gap-3 min-h-0 h-full overflow-hidden">
            <InfoPanel title="Host Computer" fill>
              <KeyValueRow
                label="CPU"
                value={`${snapshot?.host.cpuPercent ?? "—"}%`}
                rowCritical={cpuCritical}
                valueClassName={cpuCritical ? "text-[#EF4444] font-semibold" : "text-white font-semibold"}
              />
              <KeyValueRow label="Host Memory" value={`${snapshot?.host.ramPercent ?? "—"}% (info)`} />
              <KeyValueRow
                label="Response lag"
                value={snapshot ? `${snapshot.host.eventLoopLagMs} ms` : "—"}
                valueClassName={lagWarning ? "text-[#F59E0B] font-semibold" : "text-white font-semibold"}
              />
              <KeyValueRow
                label="Storage"
                value={snapshot?.persistence ?? "—"}
                valueClassName="text-white font-semibold text-[10px] uppercase"
              />
            </InfoPanel>

            <InfoPanel title="Network Activity" fill>
              <KeyValueRow label="Total req/s" value={snapshot?.traffic.totalReqPerSec ?? "—"} />
              <KeyValueRow
                label="Overall p95"
                value={
                  snapshot
                    ? snapshot.traffic.p95Reliable
                      ? formatMs(snapshot.traffic.overallP95Ms)
                      : "n/a (low traffic)"
                    : "—"
                }
              />
              <KeyValueRow
                label="Error rate"
                value={`${snapshot?.traffic.errorRatePercent ?? "—"}%`}
                rowCritical={errorCritical}
                valueClassName={errorCritical ? "text-[#EF4444] font-semibold" : "text-[#10B981] font-semibold"}
              />
              {topChannels.length > 0 ? (
                topChannels.map((row) => (
                  <KeyValueRow
                    key={row.channel}
                    label={channelLabel(row.channel)}
                    value={`${row.reqPerSec}/s · p95 ${row.p95Reliable === false ? "n/a" : formatMs(row.p95Ms)}`}
                    valueClassName="text-[#D1D5DB] font-semibold text-[12px]"
                  />
                ))
              ) : (
                <KeyValueRow label="Channels" value="No active traffic" valueClassName="text-[#6B7280] font-normal text-[12px]" />
              )}
            </InfoPanel>
          </div>

          {/* Column 3: Log */}
          <div
            className="relative flex flex-col rounded-lg border border-[#1F2335] p-4 min-h-0 h-full overflow-hidden"
            style={{ background: "rgba(17, 19, 30, 0.4)" }}
          >
            <button
              type="button"
              onClick={() => void copyLogs()}
              className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#1F2335] text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1F2335]/60 transition-colors"
              title="Copy log to clipboard"
            >
              {logCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0 pr-9">
              <h2 className="text-xs font-bold uppercase text-[#9CA3AF] tracking-wide">Log Record</h2>
              <span className="text-[10px] text-[#6B7280] whitespace-nowrap">
                Updated {snapshot ? formatTime(snapshot.generatedAt) : "—"}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-1">
              {logEntries.map((entry) => (
                <div
                  key={entry.key}
                  className="font-mono text-[11px] leading-snug p-1.5 rounded-sm text-[#D1D5DB] shrink-0"
                  style={{ background: "rgba(22, 25, 38, 0.8)", borderLeft: `3px solid ${entry.border}` }}
                >
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer
          className="shrink-0 flex items-center justify-between border-t border-[#1F2937] pt-1 text-[11px] text-[#4B5563] w-full"
          style={{ maxWidth: CONTENT_MAX_W, height: 28 }}
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRefreshMenu((v) => !v)}
              className="inline-flex items-center gap-1 hover:text-[#9CA3AF] transition-colors"
            >
              Refresh Intervals: {PANEL_REFRESH_MS / 1000}s
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showRefreshMenu && refreshRows.length > 0 ? (
              <div
                className="absolute bottom-full left-0 mb-1 z-20 min-w-[240px] rounded border border-[#1F2335] p-2 shadow-xl"
                style={{ background: "rgba(17, 19, 30, 0.95)" }}
              >
                <div className="text-[10px] uppercase tracking-wider text-[#6B7280] mb-2 px-1">Device poll intervals</div>
                {refreshRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4 px-1 py-1 text-[11px] text-[#D1D5DB]">
                    <span>{row.label}</span>
                    <span className={row.current > row.normal ? "text-[#F59E0B] font-semibold" : "text-[#10B981]"}>
                      {formatMs(row.current ?? 0)}
                      {row.current > row.normal ? ` (was ${formatMs(row.normal ?? 0)})` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <span>Status: Connected to Primary Node</span>
        </footer>
      </div>

      <VenueDeviceOffConfirmModal
        open={showOffConfirm}
        onCancel={() => setShowOffConfirm(false)}
        onConfirm={() => {
          setShowOffConfirm(false);
          void applyVenueDeviceMode("off");
        }}
      />
    </div>
  );
}
