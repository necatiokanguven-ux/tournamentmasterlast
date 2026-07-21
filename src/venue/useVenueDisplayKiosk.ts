import { useEffect } from "react";
import { useAppKioskMode } from "../dealer/useDealerKioskMode";

const VENUE_MANIFEST = "/manifest-display.json";

function useVenueDisplayManifest() {
  useEffect(() => {
    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const previousHref = link?.getAttribute("href") ?? null;

    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }

    link.href = VENUE_MANIFEST;

    return () => {
      if (previousHref) {
        link!.href = previousHref;
      }
    };
  }, []);
}

export function useVenueDisplayKiosk() {
  useVenueDisplayManifest();
  useAppKioskMode("venue-display-kiosk");
}
