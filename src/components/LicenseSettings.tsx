import React, { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { isCloudHostedApp } from "../config/api";
import type { LocalLicenseStatus } from "../license/config";
import { activateLicenseKey, claimPaidLicenseForMachine, fetchLicenseStatus } from "../license/licenseClient";
import LicenseUpgradeButtons from "./LicenseUpgradeButtons";
import { getActiveVenuePackageId, getVenuePackageTier } from "../dealerRotation/venuePackageTiers";

type LicenseSettingsProps = {
  variant?: "embedded" | "page";
};

export default function LicenseSettings({ variant = "embedded" }: LicenseSettingsProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [status, setStatus] = useState<LocalLicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCloudApp = isCloudHostedApp();

  const loadStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchLicenseStatus();
      setStatus(data);
      if (data.licenseKey) {
        setLicenseKey(data.licenseKey);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load license status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleActivate = async () => {
    setActivating(true);
    setError(null);

    try {
      const data = await activateLicenseKey(licenseKey);
      setStatus(data);
      if (data.licenseKey) {
        setLicenseKey(data.licenseKey);
      }
      window.dispatchEvent(new Event("license-updated"));
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "License activation failed.");
    } finally {
      setActivating(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      const data = await claimPaidLicenseForMachine();
      setStatus(data);
      if (data.licenseKey) {
        setLicenseKey(data.licenseKey);
      }
      window.dispatchEvent(new Event("license-updated"));
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Could not sync upgraded license.");
    } finally {
      setSyncing(false);
    }
  };

  const statusColor = status?.valid ? "text-emerald-400" : "text-amber-400";
  const StatusIcon = status?.valid ? ShieldCheck : ShieldAlert;
  const packageLabel = getVenuePackageTier(getActiveVenuePackageId()).name;

  return (
    <div
      className={
        variant === "page"
          ? "bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-lg"
          : "bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-lg"
      }
    >
      {variant === "embedded" && (
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <h2 className="text-xs font-black uppercase tracking-widest text-amber-500">
            License Activation
          </h2>
        </div>
      )}

      {isCloudApp && (
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          License activation works in the browser. Tournament data and QR tracking still require the
          Tournament Master local server on port 3000.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking license status...
        </div>
      ) : (
        <>
          {status && (
            <div className={`mb-4 flex items-start gap-2 text-sm ${statusColor}`}>
              <StatusIcon className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">
                  {status.valid ? (
                    <>
                      License active
                      <span className="mx-2" aria-hidden="true">
                        ·
                      </span>
                      Package {packageLabel}
                    </>
                  ) : (
                    "License required"
                  )}
                </p>
                <p className="text-zinc-400 text-xs mt-1">{status.message}</p>
                {status.type && (
                  <p className="text-zinc-500 text-xs mt-1">
                    Type: {status.type}
                    {status.expiresAt ? ` · Expires: ${new Date(status.expiresAt).toLocaleDateString()}` : ""}
                  </p>
                )}
                {status.machineId && (
                  <p className="text-zinc-600 text-[11px] font-mono mt-1 break-all">
                    Machine: {status.machineId}
                  </p>
                )}
              </div>
            </div>
          )}

          <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-2">
            License Key
          </label>
          <input
            type="text"
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value)}
            placeholder="TRIAL-XXXXX-XXXXX-XXXXX-XXXXX"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono text-zinc-100 focus:border-amber-500 outline-none"
          />

          {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={activating}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black rounded-xl text-xs font-black uppercase tracking-wider"
            >
              {activating ? "Activating..." : "Activate License"}
            </button>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-300"
            >
              Refresh
            </button>
            {status?.valid && (
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-white disabled:opacity-60 text-black rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                {syncing ? "Syncing..." : "Sync Upgrade"}
              </button>
            )}
          </div>

          <LicenseUpgradeButtons machineId={status?.machineId} />
        </>
      )}
    </div>
  );
}
