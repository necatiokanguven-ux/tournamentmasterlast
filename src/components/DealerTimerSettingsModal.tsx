import { useState } from "react";
import { Timer, X } from "lucide-react";

type DealerTimerSettingsModalProps = {
  callTimeSeconds: number;
  playerTimeSeconds: number;
  onSave: (callTimeSeconds: number, playerTimeSeconds: number) => Promise<void>;
  onClose: () => void;
};

export default function DealerTimerSettingsModal({
  callTimeSeconds,
  playerTimeSeconds,
  onSave,
  onClose,
}: DealerTimerSettingsModalProps) {
  const [callTime, setCallTime] = useState(callTimeSeconds);
  const [playerTime, setPlayerTime] = useState(playerTimeSeconds);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(callTime, playerTime);
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

        <label className="block mt-5">
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
