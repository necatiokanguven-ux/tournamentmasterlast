/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { Loader2, Monitor, WifiOff } from "lucide-react";
import ClockView from "./ClockView";
import { tournamentStore } from "../store";
import { useLicenseStatus } from "../license/useLicenseStatus";
import { isWsEnabled } from "../config/featureFlags";
import { useTournamentSocket } from "../websocket/useTournamentSocket";
import { isClockChannelPayload } from "../websocket/clockChannelTypes";
import { useVenueDisplayKiosk } from "../venue/useVenueDisplayKiosk";
import KioskFullscreenControl from "./KioskFullscreenControl";

export default function VenueDisplayView() {
  const { isLicensed, loading: licenseLoading, status: licenseStatus } = useLicenseStatus();
  const [dataReady, setDataReady] = useState(false);
  useVenueDisplayKiosk();

  useTournamentSocket({
    enabled: isWsEnabled(),
    channels: ["meta", "clock"],
    onMessage: (message) => {
      if (message.type !== "delta" && message.type !== "snapshot") {
        return;
      }

      if (message.channel === "clock") {
        if (isClockChannelPayload(message.payload)) {
          tournamentStore.applyRemoteClock(message.payload);
        }
        return;
      }

      if (message.channel === "meta") {
        void tournamentStore.syncFromServer();
      }
    },
  });

  useEffect(() => {
    document.documentElement.classList.add("venue-display");
    document.body.classList.add("venue-display");
    return () => {
      document.documentElement.classList.remove("venue-display");
      document.body.classList.remove("venue-display");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void tournamentStore.load().finally(() => {
      if (!cancelled) {
        setDataReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!licenseLoading && isLicensed) {
      void tournamentStore.load({ force: true });
    }
  }, [licenseLoading, isLicensed]);

  if (licenseLoading || !dataReady) {
    return (
      <div className="venue-display-root h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-xs font-bold uppercase tracking-wider">Loading venue display…</p>
        <KioskFullscreenControl enabled variant="tv" />
      </div>
    );
  }

  if (!isLicensed) {
    return (
      <div className="venue-display-root h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-red-300 gap-3 p-8 text-center">
        <WifiOff className="w-10 h-10" />
        <p className="text-sm font-bold uppercase tracking-wider">Venue display unavailable</p>
        <p className="text-xs text-zinc-400 max-w-md">
          Activate a valid license on the director PC running Tournament Master.
          {licenseStatus?.message ? ` ${licenseStatus.message}` : ""}
        </p>
        <KioskFullscreenControl enabled variant="tv" />
      </div>
    );
  }

  return (
    <div className="venue-display-root h-screen w-screen overflow-hidden bg-zinc-950">
      <ClockView venueDisplay />
      <KioskFullscreenControl enabled variant="tv" />
    </div>
  );
}
