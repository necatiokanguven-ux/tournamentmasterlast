import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Plus, Minus, X } from "lucide-react";
import type { FloorTeam } from "../types";
import { localApi } from "../config/api";

type FloorSetupModalProps = {
  tables: Array<{ id: string; number: number }>;
  initialTeams: FloorTeam[];
  onSave: (teams: FloorTeam[]) => Promise<void>;
  onClose: () => void;
};

function buildDefaultTeams(count: number, tableNumbers: number[]): FloorTeam[] {
  if (count <= 0) return [];
  if (tableNumbers.length === 0) {
    return Array.from({ length: count }, (_, index) => ({
      id: `floor-${index + 1}`,
      name: `Floor ${index + 1}`,
      tableNumbers: [],
    }));
  }

  const chunkSize = Math.ceil(tableNumbers.length / count);
  return Array.from({ length: count }, (_, index) => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, tableNumbers.length);
    return {
      id: `floor-${index + 1}`,
      name: `Floor ${index + 1}`,
      tableNumbers: tableNumbers.slice(start, end),
    };
  });
}

export default function FloorSetupModal({
  tables,
  initialTeams,
  onSave,
  onClose,
}: FloorSetupModalProps) {
  const tableNumbers = useMemo(() => tables.map((table) => table.number).sort((a, b) => a - b), [tables]);
  const [teamCount, setTeamCount] = useState(Math.max(initialTeams.length, 1));
  const [teams, setTeams] = useState<FloorTeam[]>(
    initialTeams.length > 0 ? initialTeams : buildDefaultTeams(1, tableNumbers),
  );
  const [qrTeamId, setQrTeamId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialTeams.length > 0) {
      setTeams(initialTeams);
      setTeamCount(initialTeams.length);
    }
  }, [initialTeams]);

  const toggleTable = (teamIndex: number, tableNumber: number) => {
    setTeams((current) =>
      current.map((team, index) => {
        if (index !== teamIndex) {
          return {
            ...team,
            tableNumbers: team.tableNumbers.filter((number) => number !== tableNumber),
          };
        }

        const hasTable = team.tableNumbers.includes(tableNumber);
        return {
          ...team,
          tableNumbers: hasTable
            ? team.tableNumbers.filter((number) => number !== tableNumber)
            : [...team.tableNumbers, tableNumber].sort((a, b) => a - b),
        };
      }),
    );
  };

  const handleTeamCountChange = (nextCount: number) => {
    const safeCount = Math.max(1, Math.min(12, nextCount));
    setTeamCount(safeCount);
    setTeams(buildDefaultTeams(safeCount, tableNumbers));
  };

  const openTeamQr = async (teamId: string) => {
    setQrTeamId(teamId);
    setQrUrl(null);
    setError(null);

    try {
      const response = await fetch(localApi(`/api/floor/teams/${encodeURIComponent(teamId)}/qr-url`));
      if (!response.ok) throw new Error("Could not load floor QR.");
      const data = await response.json();
      setQrUrl(data.floorUrl ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load floor QR.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(teams);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save floor setup.");
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

        <h2 className="text-xl font-black uppercase tracking-wider">Floor Setup</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Assign tables to floor teams. Each table can belong to only one team.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Floor Teams</span>
          <button type="button" onClick={() => handleTeamCountChange(teamCount - 1)} className="rounded-lg border border-zinc-700 p-2">
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-lg font-black">{teamCount}</span>
          <button type="button" onClick={() => handleTeamCountChange(teamCount + 1)} className="rounded-lg border border-zinc-700 p-2">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {teams.map((team, teamIndex) => (
            <div key={team.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase">{team.name}</p>
                  <p className="text-[10px] text-zinc-500">{team.tableNumbers.length} tables assigned</p>
                </div>
                <button
                  type="button"
                  onClick={() => void openTeamQr(team.id)}
                  className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-[10px] font-black uppercase text-orange-300"
                >
                  Floor QR
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {tableNumbers.map((tableNumber) => {
                  const active = team.tableNumbers.includes(tableNumber);
                  return (
                    <button
                      key={`${team.id}-${tableNumber}`}
                      type="button"
                      onClick={() => toggleTable(teamIndex, tableNumber)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        active
                          ? "bg-orange-500 text-black"
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
            Save Floor Setup
          </button>
        </div>

        {qrTeamId && qrUrl ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
            <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
              <button
                type="button"
                onClick={() => setQrTeamId(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-orange-400">
                <QrCode className="w-5 h-5" />
                <h3 className="text-lg font-black uppercase">{qrTeamId} QR</h3>
              </div>
              <div className="mt-5 flex flex-col items-center gap-3">
                <div className="rounded-2xl bg-white p-3">
                  <QRCodeSVG value={qrUrl} size={220} level="M" />
                </div>
                <p className="text-[11px] font-mono text-zinc-500 break-all text-center">{qrUrl}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
