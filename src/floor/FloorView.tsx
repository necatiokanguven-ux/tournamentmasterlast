import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, PhoneCall, UserX, Users } from "lucide-react";
import type { FloorCall } from "../types";
import { localApi } from "../config/api";
import { isWsEnabled } from "../config/featureFlags";
import { useMobileI18n, formatMobileTime } from "../mobile/translations";
import ConnectionStatus from "../mobile/ConnectionStatus";
import { useTournamentSocket } from "../websocket/useTournamentSocket";
import { isChannelPayloadMessage, type TournamentSocketServerMessage } from "../websocket/tournamentSocketTypes";
import { useRuntimeTuningPollMs } from "../systemHealth/useRuntimeTuning";

const DEFAULT_POLL_INTERVAL_MS = 1000;
const WS_FALLBACK_POLL_MS = 15_000;
const DEVICE_NAME_KEY = "tm-floor-device-name";
const ALERTS_ENABLED_KEY = "tm-floor-alerts-enabled";

type FloorTableSnapshot = {
  tableNumber: number;
  tableId: string;
  occupants: number;
  seats: Array<{
    seatNumber: number;
    seatIndex: number;
    playerId: string | null;
    displayName: string | null;
    isOpen: boolean;
    status: string | null;
  }>;
};

type MoveTargetTable = {
  tableNumber: number;
  tableId: string;
  occupants: number;
  emptySeats: Array<{
    seatNumber: number;
    seatIndex: number;
  }>;
};

type MoveContext = {
  playerId: string;
  playerName: string;
  fromTableNumber: number;
};

type MoveStep = "idle" | "select-table" | "select-seat";

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

  useEffect(() => {
    document.documentElement.lang = "en";
  }, []);

  const teamId = getTeamIdFromQuery();
  const wsEnabled = isWsEnabled();
  const tuningPollMs = useRuntimeTuningPollMs("floorPollMs", DEFAULT_POLL_INTERVAL_MS);
  const floorChannel = teamId ? `floor:${teamId}` : null;
  const [teamName, setTeamName] = useState("Floor");
  const [calls, setCalls] = useState<FloorCall[]>([]);
  const [tables, setTables] = useState<FloorTableSnapshot[]>([]);
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem(DEVICE_NAME_KEY) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(
    () => localStorage.getItem(ALERTS_ENABLED_KEY) === "1",
  );
  const [moveStep, setMoveStep] = useState<MoveStep>("idle");
  const [moveContext, setMoveContext] = useState<MoveContext | null>(null);
  const [moveTargets, setMoveTargets] = useState<MoveTargetTable[]>([]);
  const [selectedTargetTable, setSelectedTargetTable] = useState<MoveTargetTable | null>(null);
  const [moveMessage, setMoveMessage] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundTimerRef = useRef<number | null>(null);
  const vibrateTimerRef = useRef<number | null>(null);
  const pendingCountRef = useRef(0);
  const pendingIdsRef = useRef<Set<string>>(new Set());

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

  const applyFloorPayload = useCallback((payload: {
    teamName?: string;
    calls?: FloorCall[];
    tables?: FloorTableSnapshot[];
  }) => {
    if (payload.teamName) setTeamName(payload.teamName);
    if (payload.calls) setCalls(payload.calls);
    if (payload.tables) setTables(payload.tables);
    setError(null);
    setIsConnected(true);
  }, []);

  const handleWsMessage = useCallback((message: TournamentSocketServerMessage) => {
    if (!floorChannel || !isChannelPayloadMessage(message) || message.channel !== floorChannel) return;
    applyFloorPayload(message.payload as {
      teamName?: string;
      calls?: FloorCall[];
      tables?: FloorTableSnapshot[];
    });
  }, [applyFloorPayload, floorChannel]);

  const { connected: wsConnected } = useTournamentSocket({
    enabled: wsEnabled && Boolean(floorChannel),
    channels: floorChannel ? [floorChannel] : [],
    onMessage: handleWsMessage,
  });

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
      setIsConnected(true);
    } catch (fetchError) {
      setIsConnected(false);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load floor data.");
    }
  }, [teamId]);

  const pollIntervalMs = useMemo(() => {
    if (!wsEnabled) return tuningPollMs;
    return wsConnected ? Math.max(WS_FALLBACK_POLL_MS, tuningPollMs) : tuningPollMs;
  }, [wsConnected, wsEnabled, tuningPollMs]);

  useEffect(() => {
    if (!teamId) return;
    void fetchData();
    const timer = window.setInterval(() => {
      void fetchData();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [teamId, fetchData, pollIntervalMs]);

  useEffect(() => {
    const previousCount = pendingCountRef.current;
    const previousIds = pendingIdsRef.current;
    const currentIds = new Set(pendingCalls.map((call) => call.id));
    const hasNewPending = pendingCalls.some((call) => !previousIds.has(call.id));

    pendingCountRef.current = pendingCalls.length;
    pendingIdsRef.current = currentIds;

    if (pendingCalls.length === 0) {
      stopAlert();
      return;
    }

    if (hasNewPending || pendingCalls.length > previousCount) {
      startAlert();
      return;
    }

    startAlert();
  }, [pendingCalls, alertsEnabled, startAlert, stopAlert]);

  useEffect(() => () => stopAlert(), [stopAlert]);

  const resetMoveModal = () => {
    setMoveStep("idle");
    setMoveContext(null);
    setMoveTargets([]);
    setSelectedTargetTable(null);
    setMoveBusy(false);
  };

  const closeMoveModal = () => {
    resetMoveModal();
    setMoveMessage(null);
  };

  const fetchMoveTargets = useCallback(async () => {
    if (!teamId) return [];

    const response = await fetch(localApi(`/api/floor/move-targets?teamId=${encodeURIComponent(teamId)}`));
    if (!response.ok) {
      throw new Error(t.moveFailed);
    }

    const data = await response.json();
    return (data.tables ?? []) as MoveTargetTable[];
  }, [teamId, t.moveFailed]);

  const handleMoveStart = async (
    playerId: string,
    playerName: string,
    fromTableNumber: number,
  ) => {
    setMoveMessage(null);
    setMoveContext({ playerId, playerName, fromTableNumber });
    setMoveStep("select-table");
    setSelectedTargetTable(null);

    try {
      const targets = await fetchMoveTargets();
      setMoveTargets(targets);
    } catch (moveError) {
      resetMoveModal();
      setMoveMessage(moveError instanceof Error ? moveError.message : t.moveFailed);
    }
  };

  const handleSelectTargetTable = (table: MoveTargetTable) => {
    setSelectedTargetTable(table);
    setMoveStep("select-seat");
  };

  const handleConfirmMove = async (targetSeatIndex: number) => {
    if (!teamId || !moveContext || !selectedTargetTable) return;

    setMoveBusy(true);
    setMoveMessage(null);

    try {
      const response = await fetch(localApi("/api/floor/move-player"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          playerId: moveContext.playerId,
          targetTableNumber: selectedTargetTable.tableNumber,
          targetSeatIndex,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || t.moveFailed);
      }

      setMoveMessage(t.playerMoved);
      resetMoveModal();
      await fetchData();
    } catch (moveError) {
      setMoveMessage(moveError instanceof Error ? moveError.message : t.moveFailed);
    } finally {
      setMoveBusy(false);
    }
  };

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">{t.floorMobile}</p>
              <h1 className="mt-2 text-2xl font-black uppercase">{teamName}</h1>
            </div>
            <ConnectionStatus
              connected={isConnected}
              connectLabel={t.connect}
              disconnectLabel={t.disconnect}
            />
          </div>
          <label className="block mt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t.yourName}</span>
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Alex"
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
        {moveMessage ? <p className="text-sm text-orange-300">{moveMessage}</p> : null}

        {calls.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            {t.noFloorCalls}
          </div>
        ) : (
          calls.map((call) => {
            const isElimination = call.kind === "player_eliminated";

            return (
            <div
              key={call.id}
              className={`rounded-3xl border p-5 ${
                call.status === "pending"
                  ? isElimination
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-red-500/40 bg-red-500/10"
                  : call.status === "acknowledged"
                    ? "border-yellow-500/30 bg-yellow-500/10"
                    : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className={`flex items-center gap-2 ${isElimination ? "text-orange-300" : "text-red-300"}`}>
                {isElimination ? <UserX className="w-5 h-5" /> : <PhoneCall className="w-5 h-5" />}
                <p className="text-3xl font-black">{t.table} {call.tableNumber}</p>
              </div>

              {isElimination ? (
                <>
                  <p className="mt-3 text-xl font-black uppercase text-zinc-100">
                    {call.playerName ?? "-"}
                  </p>
                  <p className="mt-1 text-sm text-orange-200/80">
                    {t.floorPlayerEliminated} · {formatMobileTime(call.createdAt)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">
                  {t.floorCallAt} · {formatMobileTime(call.createdAt)}
                </p>
              )}

              {call.status === "pending" ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isElimination) {
                      void handleResolve(call.id);
                      return;
                    }
                    void handleAck(call.id);
                  }}
                  className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-black uppercase text-black ${
                    isElimination ? "bg-orange-500" : "bg-red-500"
                  }`}
                >
                  {isElimination ? t.dismissAlert : t.going}
                </button>
              ) : null}

              {call.status === "acknowledged" && !isElimination ? (
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
            );
          })
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
                            className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 px-3 py-2"
                          >
                            <span className="text-xs font-mono text-orange-300">{t.seat} {seat.seatNumber}</span>
                            <span className="text-sm font-semibold truncate ml-3 flex-1 text-right">
                              {seat.isOpen ? t.seatOpen : seat.displayName}
                            </span>
                            {!seat.isOpen && seat.playerId ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleMoveStart(
                                    seat.playerId!,
                                    seat.displayName ?? "",
                                    table.tableNumber,
                                  );
                                }}
                                className="shrink-0 rounded-lg border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] font-black uppercase text-orange-300"
                              >
                                {t.move}
                              </button>
                            ) : null}
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

      {moveStep !== "idle" && moveContext ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">{t.movePlayer}</p>
                <h2 className="mt-1 text-lg font-black uppercase truncate">{moveContext.playerName}</h2>
              </div>
              {moveStep === "select-seat" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoveStep("select-table");
                    setSelectedTargetTable(null);
                  }}
                  className="rounded-xl border border-zinc-700 p-2"
                  aria-label={t.selectTable}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeMoveModal}
                  className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold uppercase"
                >
                  {t.cancel}
                </button>
              )}
            </div>

            {moveStep === "select-table" ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{t.selectTable}</p>
                {moveTargets.map((table) => (
                  <button
                    key={table.tableId}
                    type="button"
                    disabled={table.emptySeats.length === 0}
                    onClick={() => handleSelectTargetTable(table)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                      table.emptySeats.length === 0
                        ? "border-zinc-800 bg-zinc-950/40 text-zinc-600"
                        : "border-zinc-700 bg-zinc-950 hover:border-orange-500/40"
                    }`}
                  >
                    <span className="font-black">{t.table} {table.tableNumber}</span>
                    <span className="text-xs text-zinc-500">
                      {table.emptySeats.length === 0
                        ? t.noEmptySeats
                        : `${table.emptySeats.length} ${t.seatOpen.toLowerCase()}`}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {moveStep === "select-seat" && selectedTargetTable ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  {t.selectSeat} · {t.table} {selectedTargetTable.tableNumber}
                </p>
                {selectedTargetTable.emptySeats.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t.noEmptySeats}</p>
                ) : (
                  selectedTargetTable.emptySeats.map((seat) => (
                    <button
                      key={`${selectedTargetTable.tableNumber}-${seat.seatIndex}`}
                      type="button"
                      disabled={moveBusy}
                      onClick={() => void handleConfirmMove(seat.seatIndex)}
                      className="flex w-full items-center justify-between rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-left hover:border-orange-500/40 disabled:opacity-60"
                    >
                      <span className="font-black">{t.seat} {seat.seatNumber}</span>
                      <span className="text-xs uppercase text-orange-300">{t.move}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
