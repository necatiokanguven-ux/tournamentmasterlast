/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTournament } from "../useTournament";
import { Edit3, Trash2, Search, Download, Upload, UserPlus, Eye, X } from "lucide-react";
import { Player, PlayerStatus } from "../types";
import { IdScanPanel, type CameraOption } from "./IdScanPanel";
import { CountryLabel, CountryFlag, countryInputDisplayValue } from "./CountryLabel";
import PlayerListShowModal from "./PlayerListShowModal";
import { normalizeCountryValue } from "../utils/countryFlags";
import { formatPlayerStatusDisplay, formatPlayerNameDisplay, formatPlayerTableSeat } from "../utils/playerRegistryReport";
import type { IdScanFields } from "../idScan/types";

const ID_SCAN_CAMERA_STORAGE_KEY = "tm-id-scan-camera-device-id";

export default function PlayersView() {
  const {
    state,
    registerPlayer,
    updatePlayer,
    deletePlayer,
    bustPlayer,
    reentryPlayer,
    addonPlayer,
    disqualifyPlayer
  } = useTournament();

  const { players, history, settings, tables } = state;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | PlayerStatus>("All");
  
  // Registration Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPlayerListModal, setShowPlayerListModal] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  
  const [formState, setFormState] = useState({
    firstName: "",
    lastName: "",
    nickname: "",
    country: "Turkey",
    birthDate: "",
    phone: "",
    notes: ""
  });
  const registerModalRef = useRef<HTMLDivElement>(null);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => {
    try {
      return localStorage.getItem(ID_SCAN_CAMERA_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const handleCamerasDiscovered = useCallback((list: CameraOption[]) => {
    setCameras(list);
    if (list.length === 0) return;

    setSelectedCameraId((current) => {
      const saved = (() => {
        try {
          return localStorage.getItem(ID_SCAN_CAMERA_STORAGE_KEY);
        } catch {
          return null;
        }
      })();

      if (saved && list.some((camera) => camera.deviceId === saved)) {
        return saved;
      }
      if (current && list.some((camera) => camera.deviceId === current)) {
        return current;
      }
      return list[0].deviceId;
    });
  }, []);

  const handleCameraSelect = useCallback((deviceId: string) => {
    setSelectedCameraId(deviceId);
    try {
      localStorage.setItem(ID_SCAN_CAMERA_STORAGE_KEY, deviceId);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (showAddModal) {
      registerModalRef.current?.scrollTo({ top: 0 });
    }
  }, [showAddModal]);

  const handleIdScanResult = useCallback((fields: IdScanFields) => {
    setFormState((prev) => ({
      ...prev,
      firstName: fields.firstName,
      lastName: fields.lastName,
      birthDate: fields.birthDate ?? "",
      country: fields.country ? normalizeCountryValue(fields.country) : prev.country,
    }));
  }, []);

  const handleBustPlayer = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    const confirmed = window.confirm(
      `${player.firstName} ${player.lastName} — are you sure you want to delete this player?`,
    );
    if (confirmed) {
      bustPlayer(playerId);
    }
  };

  const statusSortOrder: Record<PlayerStatus, number> = {
    Playing: 0,
    "Re-entry": 1,
    Waiting: 2,
    Registered: 3,
    Eliminated: 4,
  };

  const filteredPlayers = players
    .filter(p => {
      const fullName = `${p.firstName} ${p.lastName} ${p.nickname}`.toLowerCase();
      const matchesSearch = fullName.includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "All" ? true : p.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const statusDiff = statusSortOrder[a.status] - statusSortOrder[b.status];
      if (statusDiff !== 0) return statusDiff;

      if (a.status === "Eliminated" && b.status === "Eliminated") {
        return (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0);
      }

      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

  // Form handlers
  const handleInputChange = (field: keyof typeof formState, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const openRegister = () => {
    setEditingPlayerId(null);
    setFormState({
      firstName: "",
      lastName: "",
      nickname: "",
      country: "Turkey",
      birthDate: "",
      phone: "",
      notes: ""
    });
    setShowAddModal(true);
  };

  const openEdit = (player: Player) => {
    setEditingPlayerId(player.id);
    setFormState({
      firstName: player.firstName,
      lastName: player.lastName,
      nickname: player.nickname,
      country: normalizeCountryValue(player.country),
      birthDate: player.birthDate ?? "",
      phone: player.phone,
      notes: player.notes
    });
    setShowAddModal(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.firstName || !formState.lastName) {
      alert("First and Last name are required.");
      return;
    }

    const payload = {
      ...formState,
      birthDate: formState.birthDate.trim() || null,
      country: normalizeCountryValue(formState.country),
    };

    if (editingPlayerId) {
      updatePlayer(editingPlayerId, payload);
    } else {
      registerPlayer(payload);
    }
    
    setShowAddModal(false);
  };

  // Import / Export
  const exportPlayersJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(players, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `tournament_players_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const triggerImportJSON = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt: any) => {
        try {
          const imported = JSON.parse(evt.target.result);
          if (Array.isArray(imported)) {
            imported.forEach(p => {
              if (p.firstName && p.lastName) {
                registerPlayer({
                  firstName: p.firstName,
                  lastName: p.lastName,
                  nickname: p.nickname || p.firstName,
                  country: p.country || "Turkey",
                  phone: p.phone || "",
                  notes: p.notes || "Imported player"
                });
              }
            });
            alert(`Imported ${imported.length} players successfully!`);
          } else {
            alert("Invalid JSON format. Must be an array of player objects.");
          }
        } catch (e) {
          alert("Error parsing JSON file.");
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  };

  return (
    <div className="bg-zinc-950 text-zinc-100 p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wider">PLAYER REGISTRATION & MANAGEMENT</h1>
            <p className="text-zinc-400 text-xs mt-1">Register, edit, or eliminate players. Drag seating is handled in Table Manager.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlayerListModal(true)}
              className="px-4 py-2 bg-zinc-900 border border-amber-500/30 hover:border-amber-500/60 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 text-amber-400"
            >
              <Eye className="w-3.5 h-3.5" /> Player List Show
            </button>
            <button 
              onClick={triggerImportJSON}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-650 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 text-zinc-100"
            >
              <Upload className="w-3.5 h-3.5" /> Import JSON
            </button>
            <button 
              onClick={exportPlayersJSON}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-650 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 text-zinc-100"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
            <button 
              onClick={openRegister}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
            >
              <UserPlus className="w-3.5 h-3.5" /> Register Player
            </button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-zinc-900/40 border border-zinc-800 p-4 rounded-2xl shadow-md justify-between">
          
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by name, country or nickname..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 font-medium text-zinc-100"
            />
          </div>

          {/* Filter Status buttons */}
          <div className="flex flex-wrap items-center gap-1.5 border border-zinc-800 p-1 rounded-xl bg-zinc-950 shrink-0">
            {(["All", "Registered", "Playing", "Eliminated", "Waiting", "Re-entry"] as const).map(stat => {
              const active = statusFilter === stat;
              return (
                <button
                  key={stat}
                  onClick={() => setStatusFilter(stat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                    active 
                      ? "bg-amber-500 text-black" 
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                >
                  {stat}
                </button>
              );
            })}
          </div>

          {/* Counts metrics */}
          <div className="text-xs font-mono text-zinc-400 text-right shrink-0">
            Filtered players: <span className="text-zinc-100 font-bold">{filteredPlayers.length}</span> of <span className="text-yellow-500 font-bold">{players.length}</span>
          </div>

        </div>

        {/* Players List Table */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  <th className="py-4 px-5">PLAYER</th>
                  <th className="py-4 px-4">NICKNAME</th>
                  <th className="py-4 px-4">COUNTRY</th>
                  <th className="py-4 px-4">CHIPS</th>
                  <th className="py-4 px-4">REBUYS / ADD-ONS</th>
                  <th className="py-4 px-4">STATUS</th>
                  <th className="py-4 px-4">TABLE SEATING</th>
                  <th className="py-4 px-5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredPlayers.map((player) => {
                  
                  // Status styled pills
                  const statusColors = {
                    Registered: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                    Playing: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                    Eliminated: "bg-red-500/10 text-red-500 border-red-500/20",
                    Waiting: "bg-amber-500/10 text-amber-500 border-amber-500/20",
                    "Re-entry": "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  };

                  return (
                    <tr key={player.id} className="hover:bg-zinc-900/40 transition group">
                      <td className="py-3 px-5">
                        <p className="font-bold text-zinc-100 text-sm uppercase">
                          {formatPlayerNameDisplay(`${player.firstName} ${player.lastName}`)}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-yellow-500 text-xs">
                        {player.nickname ? `"${player.nickname}"` : "-"}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-zinc-300">
                        <CountryLabel country={player.country} />
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sm">
                        {player.chips > 0 ? player.chips.toLocaleString() : "-"}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-zinc-400">
                        {player.reentries > 0 ? `Re-entry x${player.reentries} ` : ""}
                        {player.rebuys > 0 ? `Rebuy x${player.rebuys} ` : ""}
                        {player.addons > 0 ? `Addon x${player.addons} ` : ""}
                        {player.reentries === 0 && player.rebuys === 0 && player.addons === 0 ? "None" : ""}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 border rounded-full text-[10px] font-black uppercase tracking-wider ${statusColors[player.status] || "bg-zinc-950"}`}>
                          {formatPlayerStatusDisplay(player.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {player.tableId ? (
                          <span className="font-bold text-zinc-100 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md">
                            {formatPlayerTableSeat(player, tables)}
                          </span>
                        ) : (
                          <span className="text-zinc-500 italic">Unseated</span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right flex items-center justify-end gap-1.5">
                        {/* Quick Action list */}
                        {player.status === "Playing" && (
                          <button 
                            onClick={() => handleBustPlayer(player.id)}
                            className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white rounded-lg text-[9px] font-bold uppercase transition"
                            title="Eliminate player"
                          >
                            BUST
                          </button>
                        )}
                        {player.status === "Eliminated" && (
                          <button 
                            onClick={() => reentryPlayer(player.id)}
                            className="px-2 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500 hover:text-white rounded-lg text-[9px] font-bold uppercase transition"
                            title="Buy re-entry"
                          >
                            RE-ENTRY
                          </button>
                        )}
                        {player.status === "Playing" && (
                          <button 
                            onClick={() => addonPlayer(player.id)}
                            className="px-2 py-1 bg-pink-500/10 text-pink-400 border border-pink-500/20 hover:bg-pink-500 hover:text-white rounded-lg text-[9px] font-bold uppercase transition"
                            title="Buy addon chips"
                          >
                            ADD-ON
                          </button>
                        )}
                        <button 
                          onClick={() => openEdit(player)}
                          className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition text-zinc-400 hover:text-zinc-100"
                          title="Edit Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => deletePlayer(player.id)}
                          className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-red-500/20 hover:text-red-500 transition text-zinc-400"
                          title="Delete player"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500 uppercase text-xs font-bold font-mono">
                      No registered players found matching query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Registration & Edit Form Modal */}
      {showAddModal && (
        <div ref={registerModalRef} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleFormSubmit}
            className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-6xl w-full flex flex-col max-h-[calc(100vh-2rem)] my-2 overflow-hidden shadow-2xl"
          >
            <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 px-6 py-4 bg-zinc-900">
              <h3 className="text-md font-black uppercase text-zinc-100 tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-5 h-5 text-amber-500" />
                {editingPlayerId ? "EDIT PLAYER INFORMATION" : "REGISTER NEW TOURNAMENT PLAYER"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              <div
                className={`grid gap-6 ${editingPlayerId ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 lg:grid-cols-2"}`}
              >
                {!editingPlayerId && (
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider shrink-0">
                        ID scan — camera & capture
                      </p>
                      <select
                        value={selectedCameraId}
                        onChange={(e) => handleCameraSelect(e.target.value)}
                        disabled={cameras.length === 0}
                        className="min-w-[160px] max-w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-100 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        aria-label="Select camera"
                      >
                        {cameras.length === 0 ? (
                          <option value="">No camera detected</option>
                        ) : (
                          cameras.map((camera) => (
                            <option key={camera.deviceId} value={camera.deviceId}>
                              {camera.label}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <IdScanPanel
                      active={showAddModal && !editingPlayerId}
                      onResult={handleIdScanResult}
                      cameraDeviceId={selectedCameraId || null}
                      onCamerasDiscovered={handleCamerasDiscovered}
                    />
                  </div>
                )}

                <div className="min-w-0 space-y-4">
                  {!editingPlayerId && (
                    <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                      Tournament player registration
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-1">First Name</label>
                      <input
                        type="text"
                        value={formState.firstName}
                        onChange={(e) => handleInputChange("firstName", e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Last Name</label>
                      <input
                        type="text"
                        value={formState.lastName}
                        onChange={(e) => handleInputChange("lastName", e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Nickname</label>
                      <input
                        type="text"
                        value={formState.nickname}
                        onChange={(e) => handleInputChange("nickname", e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Country</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <CountryFlag country={formState.country} />
                        </span>
                        <input
                          type="text"
                          value={countryInputDisplayValue(formState.country)}
                          onChange={(e) => handleInputChange("country", e.target.value)}
                          onBlur={() =>
                            handleInputChange("country", normalizeCountryValue(formState.country))
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Birth Date</label>
                      <input
                        type="date"
                        value={formState.birthDate}
                        onChange={(e) => handleInputChange("birthDate", e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={formState.phone}
                        onChange={(e) => handleInputChange("phone", e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Notes</label>
                    <textarea
                      rows={3}
                      value={formState.notes}
                      onChange={(e) => handleInputChange("notes", e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end gap-2 border-t border-zinc-800 px-6 py-4 bg-zinc-900">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-zinc-800 bg-zinc-950 rounded-xl text-xs font-bold uppercase text-zinc-400 hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-500 text-black font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-emerald-500/10"
              >
                {editingPlayerId ? "Save Changes" : "Register Player"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPlayerListModal && (
        <PlayerListShowModal
          players={players}
          history={history}
          tournamentName={settings.name}
          tables={tables}
          onClose={() => setShowPlayerListModal(false)}
        />
      )}

    </div>
  );
}
