import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, WifiOff } from "lucide-react";
import PlayerSearchPanel from "./PlayerSearchPanel";
import PlayerSeatCard from "./PlayerSeatCard";
import TrackingLivePanelContainer from "./TrackingLivePanelContainer";
import TrackingEliminatedCard from "./TrackingEliminatedCard";
import type {
  TrackingPlayerSearchItem,
  TrackingPlayersResponse,
} from "../tracking/types";
import { useTrackingI18n } from "../tracking/useTrackingI18n";
import { areTrackingPlayersEqual } from "../tracking/playerListUtils";
import { isTrackingEliminatedPlayer } from "../tracking/playerStatus";
import { TRACKING_PLAYERS_POLL_MS } from "../tracking/trackingPollConfig";
import { useRuntimeTuningPollMs } from "../systemHealth/useRuntimeTuning";

type ConnectionState = "checking" | "connected" | "error";

export default function TrackingView() {
  const { locale, t } = useTrackingI18n();
  const playersPollMs = useRuntimeTuningPollMs("trackingPollMs", TRACKING_PLAYERS_POLL_MS);
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [players, setPlayers] = useState<TrackingPlayerSearchItem[]>([]);
  const [tournamentName, setTournamentName] = useState("Tournament");
  const [selectedPlayer, setSelectedPlayer] = useState<TrackingPlayerSearchItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const playersEtagRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const loadPlayers = useCallback(async (silent = false) => {
    if (!silent) {
      setConnectionState("checking");
      setErrorMessage(null);
    }

    try {
      const playersHeaders: HeadersInit = {};
      if (playersEtagRef.current) {
        playersHeaders["If-None-Match"] = playersEtagRef.current;
      }

      const [healthResponse, playersResponse] = await Promise.all([
        fetch("/api/tracking/health"),
        fetch("/api/tracking/players", { headers: playersHeaders }),
      ]);

      if (!healthResponse.ok) {
        throw new Error(t.connectionError);
      }

      if (playersResponse.status === 304) {
        setConnectionState((current) => (silent && current === "connected" ? current : "connected"));
        return;
      }

      if (!playersResponse.ok) {
        throw new Error(t.connectionError);
      }

      const etag = playersResponse.headers.get("ETag");
      if (etag) {
        playersEtagRef.current = etag;
      }

      const playersData = (await playersResponse.json()) as TrackingPlayersResponse;

      setTournamentName((current) =>
        current === playersData.tournamentName ? current : playersData.tournamentName,
      );
      setPlayers((current) =>
        areTrackingPlayersEqual(current, playersData.players) ? current : playersData.players,
      );
      setConnectionState((current) => (silent && current === "connected" ? current : "connected"));
    } catch (error) {
      if (!silent) {
        setPlayers([]);
        setConnectionState("error");
        setErrorMessage(error instanceof Error ? error.message : t.connectionError);
      }
    }
  }, [t.connectionError]);

  useEffect(() => {
    void loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    if (connectionState !== "connected" || !selectedPlayer) {
      return;
    }

    const pollTimer = window.setInterval(() => {
      void loadPlayers(true);
    }, playersPollMs);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [connectionState, selectedPlayer, loadPlayers, playersPollMs]);

  const selectedPlayerId = useMemo(() => selectedPlayer?.id ?? null, [selectedPlayer]);

  useEffect(() => {
    if (!selectedPlayerId) {
      return;
    }

    const refreshedPlayer = players.find((player) => player.id === selectedPlayerId);
    if (!refreshedPlayer) {
      return;
    }

    setSelectedPlayer((current) => {
      if (!current || current.id !== refreshedPlayer.id) {
        return current;
      }
      if (
        current.tableNumber === refreshedPlayer.tableNumber &&
        current.seatNumber === refreshedPlayer.seatNumber &&
        current.status === refreshedPlayer.status
      ) {
        return current;
      }
      return refreshedPlayer;
    });
  }, [players, selectedPlayerId]);

  const isSelectedPlayerEliminated = useMemo(
    () => (selectedPlayer ? isTrackingEliminatedPlayer(selectedPlayer.status) : false),
    [selectedPlayer],
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <main className="flex-1 px-4 py-6 space-y-4 max-w-lg mx-auto w-full">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex items-center gap-3">
            {connectionState === "checking" && <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />}
            {connectionState === "connected" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {connectionState === "error" && <WifiOff className="w-5 h-5 text-red-400" />}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">{t.serviceName}</p>
              <p className="text-sm font-black uppercase">
                {connectionState === "checking" && t.connectionChecking}
                {connectionState === "connected" && t.connectionConnected}
                {connectionState === "error" && t.connectionFailed}
              </p>
            </div>
          </div>
          {errorMessage && (
            <p className="text-sm text-red-300 mt-3 leading-relaxed">{errorMessage}</p>
          )}
        </section>

        {connectionState === "connected" && selectedPlayer && (
          <>
            {isSelectedPlayerEliminated ? (
              <TrackingEliminatedCard
                playerName={selectedPlayer.displayName}
                t={t}
                onChangePlayer={() => setSelectedPlayer(null)}
              />
            ) : (
              <>
                <PlayerSeatCard
                  player={selectedPlayer}
                  t={t}
                  onChangePlayer={() => setSelectedPlayer(null)}
                />
                <TrackingLivePanelContainer
                  t={t}
                  locale={locale}
                  playerStatus={selectedPlayer.status}
                />
              </>
            )}
          </>
        )}

        {connectionState === "connected" && !selectedPlayer && (
          <PlayerSearchPanel
            tournamentName={tournamentName}
            players={players}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={setSelectedPlayer}
            t={t}
          />
        )}

        {connectionState === "error" && (
          <button
            onClick={() => void loadPlayers()}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider py-3 transition"
          >
            {t.tryAgain}
          </button>
        )}
      </main>
    </div>
  );
}
