import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, X } from "lucide-react";
import type { DealerZone } from "../types";

type DealerZoneSetupModalProps = {
  tables: Array<{ id: string; number: number }>;
  initialZones: DealerZone[];
  onSave: (zones: DealerZone[]) => Promise<void>;
  onClose: () => void;
};

function buildDefaultZones(count: number, tableNumbers: number[]): DealerZone[] {
  if (count <= 0) return [];
  if (tableNumbers.length === 0) {
    return Array.from({ length: count }, (_, index) => ({
      id: `zone-${index + 1}`,
      name: `Zone ${index + 1}`,
      tableNumbers: [],
    }));
  }

  const chunkSize = Math.ceil(tableNumbers.length / count);
  return Array.from({ length: count }, (_, index) => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, tableNumbers.length);
    return {
      id: `zone-${index + 1}`,
      name: `Zone ${index + 1}`,
      tableNumbers: tableNumbers.slice(start, end),
    };
  });
}

export default function DealerZoneSetupModal({
  tables,
  initialZones,
  onSave,
  onClose,
}: DealerZoneSetupModalProps) {
  const tableNumbers = useMemo(() => tables.map(table => table.number).sort((a, b) => a - b), [tables]);
  const [zoneCount, setZoneCount] = useState(Math.max(initialZones.length, 1));
  const [zones, setZones] = useState<DealerZone[]>(
    initialZones.length > 0 ? initialZones : buildDefaultZones(1, tableNumbers),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialZones.length > 0) {
      setZones(initialZones);
      setZoneCount(initialZones.length);
    }
  }, [initialZones]);

  const toggleTable = (zoneIndex: number, tableNumber: number) => {
    setZones(current =>
      current.map((zone, index) => {
        if (index !== zoneIndex) {
          return {
            ...zone,
            tableNumbers: zone.tableNumbers.filter(number => number !== tableNumber),
          };
        }

        const hasTable = zone.tableNumbers.includes(tableNumber);
        return {
          ...zone,
          tableNumbers: hasTable
            ? zone.tableNumbers.filter(number => number !== tableNumber)
            : [...zone.tableNumbers, tableNumber].sort((a, b) => a - b),
        };
      }),
    );
  };

  const handleZoneCountChange = (nextCount: number) => {
    const safeCount = Math.max(1, Math.min(8, nextCount));
    setZoneCount(safeCount);
    setZones(buildDefaultZones(safeCount, tableNumbers));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(zones);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save dealer zones.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-black uppercase tracking-wider">Dealer Zones</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Split tables into independent dealer pools. Active only when{" "}
          <code className="text-amber-300">DEALER_ZONES=true</code> on the server.
          Open dealer control with{" "}
          <code className="text-amber-300">?zone=zone-1</code> per operator.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Zones</span>
          <button type="button" onClick={() => handleZoneCountChange(zoneCount - 1)} className="rounded-lg border border-zinc-700 p-2">
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-lg font-black">{zoneCount}</span>
          <button type="button" onClick={() => handleZoneCountChange(zoneCount + 1)} className="rounded-lg border border-zinc-700 p-2">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {zones.map((zone, zoneIndex) => (
            <div key={zone.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={zone.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setZones(current => current.map((entry, index) => (
                      index === zoneIndex ? { ...entry, name } : entry
                    )));
                  }}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-black uppercase"
                />
                <p className="text-[10px] text-zinc-500">{zone.tableNumbers.length} tables · id: {zone.id}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {tableNumbers.map((tableNumber) => {
                  const active = zone.tableNumbers.includes(tableNumber);
                  return (
                    <button
                      key={`${zone.id}-${tableNumber}`}
                      type="button"
                      onClick={() => toggleTable(zoneIndex, tableNumber)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        active
                          ? "bg-sky-500 text-black"
                          : "border border-zinc-800 bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      Table {tableNumber}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40"
          >
            Save Dealer Zones
          </button>
        </div>
      </div>
    </div>
  );
}
