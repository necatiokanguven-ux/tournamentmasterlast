import { useEffect, useMemo, useState } from "react";
import { localApi } from "../config/api";
import { requestAppFullscreen } from "./useDealerKioskMode";
import {
  dealerHref,
  getDealerDeviceTypeFromQuery,
  getDealerSetupTableFromQuery,
  type DealerDeviceType,
} from "./dealerPaths";

const STORAGE_KEY = "tm-dealer-tablet-config";

type StoredDealerConfig = {
  tableNumber: number;
  setupLocked: boolean;
  deviceType: DealerDeviceType;
};

function readStoredConfig(): StoredDealerConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDealerConfig>;
    if (!parsed.tableNumber) return null;
    return {
      tableNumber: parsed.tableNumber,
      setupLocked: parsed.setupLocked ?? false,
      deviceType: parsed.deviceType === "phone" ? "phone" : "tablet",
    };
  } catch {
    return null;
  }
}

function writeStoredConfig(config: StoredDealerConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

type DealerSetupViewProps = {
  onConfigured: (tableNumber: number) => void;
};

export default function DealerSetupView({ onConfigured }: DealerSetupViewProps) {
  const queryTable = getDealerSetupTableFromQuery();
  const queryDevice = getDealerDeviceTypeFromQuery();
  const [tables, setTables] = useState<Array<{ number: number }>>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(queryTable);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTables = async () => {
      try {
        const response = await fetch(localApi("/api/dealer/tables"));
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || data.error || "Local server unavailable.");
        }
        const data = await response.json();
        if (!cancelled) {
          setTables(data.tables ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to connect.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadTables();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveTable = useMemo(() => queryTable ?? selectedTable, [queryTable, selectedTable]);

  const handleConfirm = async () => {
    if (!effectiveTable || confirming) return;

    setConfirming(true);
    setError(null);

    try {
      const knownTable = tables.some((table) => table.number === effectiveTable);
      if (!loading && tables.length > 0 && !knownTable) {
        throw new Error(`Table ${effectiveTable} was not found on the tournament server.`);
      }

      writeStoredConfig({
        tableNumber: effectiveTable,
        setupLocked: true,
        deviceType: queryDevice ?? readStoredConfig()?.deviceType ?? "tablet",
      });
      window.history.replaceState({}, "", dealerHref(`/dealer/${effectiveTable}`));
      await requestAppFullscreen();
      onConfigured(effectiveTable);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Could not open dealer screen.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-400">Dealer Tablet Setup</p>
        <h1 className="mt-2 text-2xl font-black uppercase tracking-wider">Connect To Table</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Scan the table QR from Tournament Master or choose the table number manually.
        </p>

        {loading ? <p className="mt-6 text-sm text-zinc-500">Loading tables...</p> : null}
        {error ? <p className="mt-6 text-sm text-red-400">{error}</p> : null}

        {!loading && !queryTable ? (
          <label className="block mt-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Table Number</span>
            <select
              value={selectedTable ?? ""}
              onChange={(event) => setSelectedTable(Number.parseInt(event.target.value, 10))}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm"
            >
              <option value="">Select table</option>
              {tables.map((table) => (
                <option key={table.number} value={table.number}>
                  Table {table.number}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {effectiveTable ? (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Ready To Bind</p>
            <p className="mt-2 text-3xl font-black">Table {effectiveTable}</p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={!effectiveTable || confirming || loading}
          className="mt-6 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-black disabled:opacity-40"
        >
          {confirming ? "Opening..." : "Confirm And Open Dealer Screen"}
        </button>
      </div>
    </div>
  );
}

export { STORAGE_KEY, readStoredConfig, writeStoredConfig };
