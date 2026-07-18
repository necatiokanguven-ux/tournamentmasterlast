import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhoneCall } from "lucide-react";
import type { FloorCall } from "../types";
import { localApi } from "../config/api";

const POLL_INTERVAL_MS = 1000;
const DEVICE_NAME_KEY = "tm-floor-device-name";

function playAlertLoop() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    return { ctx, osc, gain };
  } catch {
    return null;
  }
}

function getTeamIdFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("team");
}

export default function FloorView() {
  const teamId = getTeamIdFromQuery();
  const [teamName, setTeamName] = useState("Floor");
  const [calls, setCalls] = useState<FloorCall[]>([]);
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem(DEVICE_NAME_KEY) ?? "");
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  const pendingCalls = useMemo(
    () => calls.filter((call) => call.status === "pending"),
    [calls],
  );

  const stopAlert = useCallback(() => {
    if (!alertRef.current) return;
    alertRef.current.osc.stop();
    alertRef.current.ctx.close().catch(() => undefined);
    alertRef.current = null;
  }, []);

  const startAlert = useCallback(() => {
    if (alertRef.current) return;
    const handle = playAlertLoop();
    if (handle) {
      alertRef.current = handle;
    }
    if (navigator.vibrate) {
      navigator.vibrate([300, 120, 300]);
    }
  }, []);

  const fetchCalls = useCallback(async () => {
    if (!teamId) return;

    try {
      const response = await fetch(localApi(`/api/floor/calls?teamId=${encodeURIComponent(teamId)}`));
      if (!response.ok) throw new Error("Failed to load floor calls.");
      const data = await response.json();
      setTeamName(data.teamName ?? teamId);
      setCalls(data.calls ?? []);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load floor calls.");
    }
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    void fetchCalls();
    const timer = window.setInterval(() => {
      void fetchCalls();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [teamId, fetchCalls]);

  useEffect(() => {
    if (pendingCalls.length > 0) {
      startAlert();
    } else {
      stopAlert();
    }
  }, [pendingCalls.length, startAlert, stopAlert]);

  useEffect(() => () => stopAlert(), [stopAlert]);

  const handleAck = async (callId: string) => {
    if (!teamId) return;
    const acknowledgedBy = deviceName.trim() || "Floor";

    const response = await fetch(localApi(`/api/floor/calls/${callId}/ack`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, acknowledgedBy }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.message || data.error || "Could not acknowledge call.");
      return;
    }

    localStorage.setItem(DEVICE_NAME_KEY, acknowledgedBy);
    await fetchCalls();
  };

  const handleResolve = async (callId: string) => {
    if (!teamId) return;

    const response = await fetch(localApi(`/api/floor/calls/${callId}/resolve`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.message || data.error || "Could not resolve call.");
      return;
    }

    await fetchCalls();
  };

  if (!teamId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <p className="text-sm text-red-400">Missing floor team. Scan the floor QR from Tournament Master.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">Floor Mobile</p>
          <h1 className="mt-2 text-2xl font-black uppercase">{teamName}</h1>
          <label className="block mt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Your Name</span>
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Ali"
            />
          </label>
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {calls.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            No active floor calls for this team.
          </div>
        ) : (
          calls.map((call) => (
            <div
              key={call.id}
              className={`rounded-3xl border p-5 ${
                call.status === "pending"
                  ? "border-red-500/40 bg-red-500/10"
                  : call.status === "acknowledged"
                    ? "border-yellow-500/30 bg-yellow-500/10"
                    : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2 text-red-300">
                <PhoneCall className="w-5 h-5" />
                <p className="text-3xl font-black">Table {call.tableNumber}</p>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {new Date(call.createdAt).toLocaleTimeString()}
              </p>

              {call.status === "pending" ? (
                <button
                  type="button"
                  onClick={() => void handleAck(call.id)}
                  className="mt-4 w-full rounded-xl bg-red-500 px-4 py-3 text-sm font-black uppercase text-black"
                >
                  Gidiyorum
                </button>
              ) : null}

              {call.status === "acknowledged" ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-yellow-200">
                    {call.acknowledgedBy ? `${call.acknowledgedBy} müdahale ediyor` : "Floor is responding"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleResolve(call.id)}
                    className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-black uppercase"
                  >
                    Çözüldü
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
