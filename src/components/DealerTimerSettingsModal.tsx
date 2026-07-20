import { useState } from "react";
import { Timer, X } from "lucide-react";
import type { DealerTimerModeSetting } from "../types";

type DealerTimerSettingsModalProps = {
  timerMode: DealerTimerModeSetting;
  callTimeSeconds: number;
  playerTimeSeconds: number;
  onSave: (
    timerMode: DealerTimerModeSetting,
    callTimeSeconds: number,
    playerTimeSeconds: number,
  ) => Promise<void>;
  onClose: () => void;
};

const MODE_OPTIONS: { value: DealerTimerModeSetting; label: string; description: string }[] = [
  {
    value: "none",
    label: "None",
    description: "Dealer tablets use Call Floor only — no countdown timer.",
  },
  {
    value: "call_time",
    label: "Call Time",
    description: "Show Call Time only. Synced instantly between dealer devices.",
  },
  {
    value: "player_time",
    label: "Player Time",
    description: "Show Player Time only. Synced via polling.",
  },
];

export default function DealerTimerSettingsModal({
  timerMode,
  callTimeSeconds,
  playerTimeSeconds,
  onSave,
  onClose,
}: DealerTimerSettingsModalProps) {
  const [mode, setMode] = useState<DealerTimerModeSetting>(timerMode);
  const [callTime, setCallTime] = useState(callTimeSeconds);
  const [playerTime, setPlayerTime] = useState(playerTimeSeconds);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(mode, callTime, playerTime);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save timer settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-cyan-400">
          <Timer className="w-5 h-5" />
          <h2 className="text-lg font-black uppercase tracking-wider">Dealer Timers</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          These defaults apply to all dealer tablets. Tablets cannot change them locally.
        </p>

        <fieldset className="mt-5 space-y-2">
          <legend className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Timer Mode</legend>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                mode === option.value
                  ? "border-cyan-500/60 bg-cyan-500/10"
                  : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="dealerTimerMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1 accent-cyan-500"
              />
              <span>
                <span className="block text-sm font-bold text-zinc-100">{option.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === "call_time" ? (
          <label className="block mt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Call Time (seconds)</span>
            <input
              type="number"
              min={10}
              max={120}
              value={callTime}
              onChange={(event) => setCallTime(Number.parseInt(event.target.value, 10) || 30)}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm"
            />
          </label>
        ) : null}

        {mode === "player_time" ? (
          <label className="block mt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Player Time (seconds)</span>
            <input
              type="number"
              min={15}
              max={180}
              value={playerTime}
              onChange={(event) => setPlayerTime(Number.parseInt(event.target.value, 10) || 60)}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm"
            />
          </label>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40"
          >
            Save Timers
          </button>
        </div>
      </div>
    </div>
  );
}
