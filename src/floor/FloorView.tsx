import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, PhoneCall, Users } from "lucide-react";
import type { FloorCall } from "../types";
import { localApi } from "../config/api";
import { useMobileI18n } from "../mobile/translations";

const POLL_INTERVAL_MS = 1000;
const DEVICE_NAME_KEY = "tm-floor-device-name";
const ALERTS_ENABLED_KEY = "tm-floor-alerts-enabled";

type FloorTableSnapshot = {
  tableNumber: number;
  tableId: string;
  occupants: number;
  seats: Array<{
    seatNumber: number;
    displayName: string | null;
    isOpen: boolean;
    status: string | null;
  }>;
};

function playAlertBeep(audioContext: AudioContext) {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, audioContext.currentTime);
  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.25);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + 0.26);
}

function getTeamIdFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("team");
}

export default function FloorView() {
  const { t } = useMobileI18n();
  const teamId = getTeamIdFromQuery();
  const [teamName, setTeamName] = useState("Floor");
  const [calls, setCalls] = useState<FloorCall[]>([]);
  const [tables, setTables] = useState<FloorTableSnapshot[]>([]);
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem(DEVICE_NAME_KEY) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(
    () => localStorage.getItem(ALERTS_ENABLED_KEY) === "1",
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundTimerRef = useRef<number | null>(null);
  const vibrateTimerRef = useRef<number | null>(null);
  const pendingCountRef = useRef(0);

  const pendingCalls = useMemo(
    () => calls.filter((call) => call.status === "pending"),
    [calls],
  );

  const unlockAlerts = useCallback(async () => {
    try {
      const AudioContextClass =
        window.AudioContext
        || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        localStorage.setItem(ALERTS_ENABLED_KEY, "1");
        setAlertsEnabled(true);
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      playAlertBeep(audioContextRef.current);
      localStorage.setItem(ALERTS_ENABLED_KEY, "1");
      setAlertsEnabled(true);
    } catch {
      localStorage.setItem(ALERTS_ENABLED_KEY, "1");
      setAlertsEnabled(true);
    }
  }, []);

  const stopSoundAlert = useCallback(() => {
    if (soundTimerRef.current !== null) {
      window.clearInterval(soundTimerRef.current);
      soundTimerRef.current = null;
    }
  }, []);

  const stopVibrateAlert = useCallback(() => {
    if (vibrateTimerRef.current !== null) {
      window.clearInterval(vibrateTimerRef.current);
      vibrateTimerRef.current = null;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  }, []);

  const stopAlert = useCallback(() => {
    stopSoundAlert();
    stopVibrateAlert();
  }, [stopSoundAlert, stopVibrateAlert]);

  const startVibrateAlert = useCallback(() => {
    stopVibrateAlert();

    const vibratePattern = () => {
      if (navigator.vibrate) {
        navigator.vibrate([400, 150, 400, 150, 400]);
      }
    };

    vibratePattern();
    vibrateTimerRef.current = window.setInterval(vibratePattern, 2500);
  }, [stopVibrateAlert]);

  const startSoundAlert = useCallback(() => {
    if (!alertsEnabled || !audioContextRef.current) {
      return;
    }

    stopSoundAlert();

    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }

    playAlertBeep(audioContextRef.current);
    soundTimerRef.current = window.setInterval(() => {
      if (audioContextRef.current) {
        playAlertBeep(audioContextRef.current);
      }
    }, 1200);
  }, [alertsEnabled, stopSoundAlert]);

  const startAlert = useCallback(() => {
    if (pendingCalls.length === 0) {
      return;
    }
    startVibrateAlert();
    startSoundAlert();
  }, [pendingCalls.length, startSoundAlert, startVibrateAlert]);

  useEffect(() => {
    if (!alertsEnabled) return;

    const AudioContextClass =
      window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
  }, [alertsEnabled]);

  const fetchData = useCallback(async () => {
    if (!teamId) return;

    try {
      const [callsResponse, tablesResponse] = await Promise.all([
        fetch(localApi(`/api/floor/calls?teamId=${encodeURIComponent(teamId)}`)),
        fetch(localApi(`/api/floor/tables?teamId=${encodeURIComponent(teamId)}`)),
      ]);

      if (!callsResponse.ok) throw new Error("Failed to load floor calls.");
      if (!tablesResponse.ok) throw new Error("Failed to load assigned tables.");

      const callsData = await callsResponse.json();
      const tablesData = await tablesResponse.json();

      setTeamName(callsData.teamName ?? teamId);
      setCalls(callsData.calls ?? []);
      setTables(tablesData.tables ?? []);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load floor data.");
    }
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    void fetchData();
    const timer = window.setInterval(() => {
      void fetchData();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [teamId, fetchData]);

  useEffect(() => {
    const previousCount = pendingCountRef.current;
    pendingCountRef.current = pendingCalls.length;

    if (pendingCalls.length === 0) {
      stopAlert();
      return;
    }

    startAlert();

    if (previousCount === 0 && pendingCalls.length > 0 && !alertsEnabled) {
      startVibrateAlert();
    }
  }, [pendingCalls.length, alertsEnabled, startAlert, startVibrateAlert, stopAlert]);

  useEffect(() => () => stopAlert(), [stopAlert]);

  const handleAck = async (callId: string) => {
    if (!teamId) return;
    if (!alertsEnabled) {
      await unlockAlerts();
    }

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
    await fetchData();
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

    await fetchData();
  };

  if (!teamId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <p className="text-sm text-red-400">{t.missingTeam}</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-zinc-950 text-zinc-100 p-4"
      onClick={() => {
        if (!alertsEnabled) {
          void unlockAlerts();
        }
      }}
    >
      <div className="mx-auto max-w-lg space-y-4">
        {pendingCalls.length > 0 && !alertsEnabled ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void unlockAlerts();
            }}
            className="w-full rounded-2xl border border-red-500/50 bg-red-500/20 px-4 py-4 text-sm font-black uppercase text-red-200 animate-pulse"
          >
            {t.enableAlerts}
          </button>
        ) : null}

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">{t.floorMobile}</p>
          <h1 className="mt-2 text-2xl font-black uppercase">{teamName}</h1>
          <label className="block mt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t.yourName}</span>
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Ali"
            />
          </label>
          {alertsEnabled ? (
            <p className="mt-4 text-xs text-green-400">{t.alertsEnabled}</p>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void unlockAlerts();
              }}
              className="mt-4 w-full rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-xs font-black uppercase text-orange-300"
            >
              {t.enableAlerts}
            </button>
          )}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {calls.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            {t.noFloorCalls}
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
                <p className="text-3xl font-black">{t.table} {call.tableNumber}</p>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {t.floorCallAt} · {new Date(call.createdAt).toLocaleTimeString()}
              </p>

              {call.status === "pending" ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleAck(call.id);
                  }}
                  className="mt-4 w-full rounded-xl bg-red-500 px-4 py-3 text-sm font-black uppercase text-black"
                >
                  {t.going}
                </button>
              ) : null}

              {call.status === "acknowledged" ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-yellow-200">
                    {call.acknowledgedBy ? t.responding(call.acknowledgedBy) : t.going}
                  </p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleResolve(call.id);
                    }}
                    className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-black uppercase"
                  >
                    {t.resolved}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2 text-zinc-200">
            <Users className="w-5 h-5" />
            <h2 className="text-lg font-black uppercase">{t.assignedTables}</h2>
          </div>

          {tables.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">{t.noAssignedTables}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {tables.map((table) => {
                const isExpanded = expandedTable === table.tableNumber;
                return (
                  <div key={table.tableId} className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedTable(isExpanded ? null : table.tableNumber);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-xl font-black">{t.table} {table.tableNumber}</p>
                        <p className="mt-1 text-xs text-zinc-500">{t.occupants(table.occupants)}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
                        {table.seats.map((seat) => (
                          <div
                            key={`${table.tableNumber}-${seat.seatNumber}`}
                            className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2"
                          >
                            <span className="text-xs font-mono text-orange-300">{t.seat} {seat.seatNumber}</span>
                            <span className="text-sm font-semibold truncate ml-3">
                              {seat.isOpen ? t.seatOpen : seat.displayName}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
