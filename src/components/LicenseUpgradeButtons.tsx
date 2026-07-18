import React, { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { isCloudHostedApp, localApi } from "../config/api";
import { buildPurchaseUrl } from "../license/pokerclupApi";

type LicenseUpgradeButtonsProps = {
  machineId?: string | null;
  compact?: boolean;
};

async function resolveMachineId(existing?: string | null): Promise<string | null> {
  if (existing) {
    return existing;
  }

  if (isCloudHostedApp()) {
    const { getOrCreateBrowserMachine } = await import("../license/browserLicense");
    return getOrCreateBrowserMachine().machineId;
  }

  try {
    const response = await fetch(localApi("/api/license/machine"));
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { machineId?: string };
    return data.machineId ?? null;
  } catch {
    return null;
  }
}

export default function LicenseUpgradeButtons({
  machineId: machineIdProp,
  compact = false,
}: LicenseUpgradeButtonsProps) {
  const [machineId, setMachineId] = useState<string | null>(machineIdProp ?? null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const resolved = await resolveMachineId(machineIdProp);
      if (!cancelled) {
        setMachineId(resolved);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [machineIdProp]);

  const openUpgrade = (planId: "short" | "annual") => {
    if (!machineId) {
      return;
    }
    window.open(buildPurchaseUrl(planId, machineId), "_blank", "noopener,noreferrer");
  };

  const buttonClass = compact
    ? "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider"
    : "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider";

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800">
      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2">
        Extend or upgrade before expiry
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openUpgrade("short")}
          disabled={!machineId}
          className={`${buttonClass} bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white inline-flex items-center gap-1.5`}
        >
          Upgrade Plan — 30 Day
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => openUpgrade("annual")}
          disabled={!machineId}
          className={`${buttonClass} bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white inline-flex items-center gap-1.5`}
        >
          Upgrade Plan — Annual 1 Year
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
        Complete payment on pokerclup.com, then return here and click Refresh or Sync after admin approval.
      </p>
    </div>
  );
}
