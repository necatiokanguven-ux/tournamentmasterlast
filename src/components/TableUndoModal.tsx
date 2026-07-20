import { useMemo, useState } from "react";
import { Undo2, X } from "lucide-react";
import type { TableUndoEntrySummary } from "../store";
import type { HistoryEvent } from "../types";

type TableUndoModalProps = {
  entries: TableUndoEntrySummary[];
  onUndo: (selectedIds: string[]) => Promise<void> | void;
  onClose: () => void;
};

const TYPE_LABELS: Partial<Record<HistoryEvent["type"], string>> = {
  seating: "Seating",
  move: "Move",
  balance: "Table",
  bust: "Bust",
  undo: "Undo",
};

function formatEntryTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TableUndoModal({ entries, onUndo, onClose }: TableUndoModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = entries.length > 0 && selectedIds.length === entries.length;

  const selectedSummary = useMemo(() => {
    if (selectedIds.length === 0) return "No actions selected.";
    if (selectedIds.length === 1) return "1 action will be reversed.";
    return `${selectedIds.length} actions will be reversed.`;
  }, [selectedIds.length]);

  const toggleEntry = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id],
    );
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : entries.map((entry) => entry.id));
  };

  const handleUndo = async () => {
    if (selectedIds.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await onUndo(selectedIds);
      onClose();
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Failed to undo selected actions.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="border-b border-zinc-800 px-6 py-5">
          <div className="flex items-center gap-2 text-sky-400">
            <Undo2 className="w-5 h-5" />
            <h2 className="text-lg font-black uppercase tracking-wider">Undo Table Actions</h2>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Select one or more recorded actions to reverse. Dependent actions are checked before undo runs.
            Closed tables needed for a seat restore are reopened automatically when safe.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {entries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
              No table actions available to undo.
            </p>
          ) : (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-sky-500"
                />
                <span className="text-xs font-black uppercase tracking-wider text-zinc-300">
                  Select All ({entries.length})
                </span>
              </label>

              {entries.map((entry, index) => {
                const checked = selectedIds.includes(entry.id);
                const typeLabel = TYPE_LABELS[entry.type] ?? entry.type;

                return (
                  <label
                    key={entry.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                      checked
                        ? "border-sky-500/50 bg-sky-500/10"
                        : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEntry(entry.id)}
                      className="mt-1 h-4 w-4 accent-sky-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-zinc-700 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                          #{entries.length - index}
                        </span>
                        <span className="rounded-md border border-zinc-700 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-300/90">
                          {typeLabel}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          {formatEntryTime(entry.timestamp)}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-zinc-100">{entry.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 px-6 py-4">
          <p className="text-xs text-zinc-500">{selectedSummary}</p>
          {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || selectedIds.length === 0}
              onClick={() => void handleUndo()}
              className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40"
            >
              Undo Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
