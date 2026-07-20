import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import {
  VENUE_PACKAGE_TIERS,
  describePackageLimitExceeded,
  getActiveVenuePackageId,
  getVenuePackageTier,
  type PackageLimitSnapshot,
} from "../dealerRotation/venuePackageTiers";

type DealerControlPackagePanelProps = {
  limitSnapshot: PackageLimitSnapshot;
};

const PACKAGE_LIMIT_WARNING =
  "If your tournament exceeds these limits, disable the Dealer Control module and continue with QR Live Tracking only.";

export default function DealerControlPackagePanel({
  limitSnapshot,
}: DealerControlPackagePanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activePackageId = getActiveVenuePackageId();
  const activeTier = getVenuePackageTier(activePackageId);
  const exceededReasons = describePackageLimitExceeded(activePackageId, limitSnapshot);
  const exceedsLimits = exceededReasons.length > 0;

  return (
    <section
      className={`rounded-xl border px-4 py-3 ${
        exceedsLimits
          ? "border-red-500/55 bg-red-500/10"
          : "border-amber-500/45 bg-amber-500/10"
      }`}
      role="note"
      aria-labelledby="dealer-control-package-heading"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`w-5 h-5 shrink-0 mt-0.5 ${
            exceedsLimits ? "text-red-400 animate-pulse" : "text-amber-400"
          }`}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p
              id="dealer-control-package-heading"
              className={`text-[10px] font-black uppercase tracking-wider ${
                exceedsLimits ? "text-red-300" : "text-amber-300"
              }`}
            >
              Important — package capacity warning
            </p>
            <p className={`text-sm font-bold mt-1 ${exceedsLimits ? "text-red-100" : "text-amber-100"}`}>
              Your package: {activeTier.name}
            </p>
            <p className={`text-xs mt-0.5 ${exceedsLimits ? "text-red-100/90" : "text-amber-100/90"}`}>
              {activeTier.operations} · {activeTier.mobileDevicesLabel}
            </p>
          </div>

          <p
            className={`text-xs leading-relaxed ${
              exceedsLimits ? "text-red-100/95 font-medium" : "text-amber-100/95"
            }`}
          >
            {PACKAGE_LIMIT_WARNING}
          </p>

          {exceedsLimits ? (
            <p className="text-xs text-red-200 font-bold" role="alert">
              Current setup: {exceededReasons.join(" · ")} — Dealer Control is locked.
            </p>
          ) : (
            <p className="text-[11px] text-amber-100/75">
              Current setup: {limitSnapshot.tableCount} table
              {limitSnapshot.tableCount === 1 ? "" : "s"},{" "}
              {limitSnapshot.mobileDeviceCount} estimated mobile device
              {limitSnapshot.mobileDeviceCount === 1 ? "" : "s"} — within limits.
            </p>
          )}

          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${
              exceedsLimits
                ? "text-red-200 hover:text-red-100"
                : "text-amber-300 hover:text-amber-200"
            }`}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {detailsOpen ? "Hide details" : "Show details"}
          </button>

          {detailsOpen ? (
            <div className="space-y-3 pt-1 border-t border-white/10">
              <div className="overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950/60">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      <th className="px-3 py-2">Package</th>
                      <th className="px-3 py-2">Supported operation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VENUE_PACKAGE_TIERS.map((tier) => {
                      const isActive = tier.id === activePackageId;
                      return (
                        <tr
                          key={tier.id}
                          className={`border-b border-zinc-800/80 last:border-b-0 ${
                            isActive ? "bg-amber-500/15" : "text-zinc-400"
                          }`}
                        >
                          <td className="px-3 py-2 align-top">
                            <span
                              className={`font-black uppercase tracking-wide ${
                                isActive ? "text-amber-200" : "text-zinc-300"
                              }`}
                            >
                              {tier.name}
                            </span>
                            {isActive ? (
                              <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-amber-400/90">
                                (yours)
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 align-top leading-relaxed">
                            <span className={isActive ? "text-amber-100/95" : "text-zinc-400"}>
                              {tier.operations}
                            </span>
                            <span
                              className={`block mt-0.5 ${
                                isActive ? "text-amber-300/80" : "text-zinc-500"
                              }`}
                            >
                              {tier.mobileDevicesLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Reference tiers for upgrade planning. Contact PokerClup for Venue or Enterprise when
                your event outgrows Standard limits.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};
