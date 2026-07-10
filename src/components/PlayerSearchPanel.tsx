import React, { useMemo, useState } from "react";
import { Search, User } from "lucide-react";
import type { TrackingPlayerSearchItem } from "../tracking/types";
import type { TrackingTranslations } from "../tracking/translations";
import { filterPlayersByQuery } from "../tracking/playerSearch";
import { isTrackingActivePlayer } from "../tracking/playerStatus";

type PlayerSearchPanelProps = {
  tournamentName: string;
  players: TrackingPlayerSearchItem[];
  selectedPlayerId: string | null;
  onSelectPlayer: (player: TrackingPlayerSearchItem) => void;
  t: TrackingTranslations;
};

export default function PlayerSearchPanel({
  tournamentName,
  players,
  selectedPlayerId,
  onSelectPlayer,
  t,
}: PlayerSearchPanelProps) {
  const [query, setQuery] = useState("");

  const searchablePlayers = useMemo(
    () => players.filter((player) => isTrackingActivePlayer(player.status)),
    [players],
  );

  const filteredPlayers = useMemo(
    () => filterPlayersByQuery(searchablePlayers, query),
    [searchablePlayers, query],
  );

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4" id="player-search-panel">
      <div>
        <h2 className="text-lg font-black uppercase tracking-wide text-zinc-100">{tournamentName}</h2>
      </div>

      <div>
        <label htmlFor="player-search-input" className="text-xs font-black uppercase tracking-wider text-amber-400">
          {t.findYourName}
        </label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            id="player-search-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
          />
        </div>
        <p className="text-xs text-zinc-500 mt-2">{t.searchHint}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-zinc-500">
          <span>{t.players}</span>
          <span>{t.playersShown(filteredPlayers.length)}</span>
        </div>

        <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-1">
          {filteredPlayers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-8 text-center">
              <p className="text-sm font-bold text-zinc-400">{t.noPlayersFound}</p>
              <p className="text-xs text-zinc-600 mt-1">{t.tryDifferentSpelling}</p>
            </div>
          ) : (
            filteredPlayers.map((player) => {
              const isSelected = selectedPlayerId === player.id;

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onSelectPlayer(player)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-2 ${isSelected ? "bg-amber-500/20" : "bg-zinc-900"}`}>
                      <User className={`w-4 h-4 ${isSelected ? "text-amber-400" : "text-zinc-500"}`} />
                    </div>
                    <span className="text-base font-bold text-zinc-100">{player.displayName}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
