import { useEffect, useState } from "react";
import {
  nudgeBrowserChromeHidden,
  requestAppFullscreen,
  useAppKioskMode,
} from "../dealer/useDealerKioskMode";

const VENUE_MANIFEST = "/manifest-display.json";

function isFullscreenActive() {
  return Boolean(
    document.fullscreenElement ||
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement,
  );
}

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

  const [showFullscreenHint, setShowFullscreenHint] = useState(true);

  useEffect(() => {
    const syncHint = () => {
      setShowFullscreenHint(!isFullscreenActive());
    };

    const onFullscreenChange = () => syncHint();

    syncHint();
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    const retryTimer = window.setInterval(() => {
      if (isFullscreenActive()) {
        return;
      }
      void requestAppFullscreen();
      nudgeBrowserChromeHidden();
    }, 5000);

    const hideHintTimer = window.setTimeout(() => {
      if (isFullscreenActive()) {
        setShowFullscreenHint(false);
      }
    }, 15000);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      window.clearInterval(retryTimer);
      window.clearTimeout(hideHintTimer);
    };
  }, []);

  const dismissHint = () => {
    setShowFullscreenHint(false);
    void requestAppFullscreen();
    nudgeBrowserChromeHidden();
  };

  return { showFullscreenHint, dismissHint, isFullscreenActive };
}
