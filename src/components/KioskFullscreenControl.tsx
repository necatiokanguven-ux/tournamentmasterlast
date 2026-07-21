import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, Globe } from "lucide-react";
import {
  exitAppFullscreen,
  isFullscreenActive,
  lockLandscapeOrientation,
  nudgeBrowserChromeHidden,
  requestAppFullscreen,
} from "../dealer/useDealerKioskMode";

type KioskFullscreenControlProps = {
  enabled?: boolean;
  variant: "tv" | "tablet";
};

const RETRY_MS = 5_000;

/**
 * Kiosk chrome control for venue TV and dealer table tablets.
 * - Not fullscreen: bottom bar with arrow to enter fullscreen.
 * - Fullscreen: small globe only — tap to exit and show browser chrome again.
 */
export default function KioskFullscreenControl({
  enabled = true,
  variant,
}: KioskFullscreenControlProps) {
  const [isFullscreen, setIsFullscreen] = useState(() => isFullscreenActive());
  const userExitedRef = useRef(false);

  const syncFullscreen = useCallback(() => {
    setIsFullscreen(isFullscreenActive());
  }, []);

  const enterFullscreen = useCallback(async () => {
    userExitedRef.current = false;
    await requestAppFullscreen();
    if (variant === "tablet") {
      await lockLandscapeOrientation();
    }
    nudgeBrowserChromeHidden();
    syncFullscreen();
  }, [syncFullscreen, variant]);

  const showBrowserChrome = useCallback(async () => {
    userExitedRef.current = true;
    await exitAppFullscreen();
    syncFullscreen();
  }, [syncFullscreen]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    syncFullscreen();

    const onFullscreenChange = () => {
      syncFullscreen();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    if (!userExitedRef.current) {
      void enterFullscreen();
    }

    const retryTimer = window.setInterval(() => {
      if (userExitedRef.current || isFullscreenActive()) {
        return;
      }
      void enterFullscreen();
    }, RETRY_MS);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      window.clearInterval(retryTimer);
    };
  }, [enabled, enterFullscreen, syncFullscreen]);

  if (!enabled) {
    return null;
  }

  if (isFullscreen) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void showBrowserChrome();
        }}
        aria-label="Show browser controls"
        title="Show browser controls"
        className="kiosk-fullscreen-globe fixed z-[320] flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/70 text-zinc-400 opacity-40 shadow-lg backdrop-blur-sm hover:opacity-100"
        style={{
          bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          right: "max(0.75rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <Globe className="h-4 w-4" strokeWidth={2.25} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void enterFullscreen();
      }}
      aria-label="Enter full screen"
      className={`kiosk-fullscreen-bar fixed inset-x-0 bottom-0 z-[320] flex items-center justify-center gap-2 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 text-center text-xs text-zinc-300 backdrop-blur-sm${
        variant === "tv" ? " kiosk-fullscreen-bar--tv" : ""
      }`}
      style={{
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {variant === "tv" ? (
        <>
          <ChevronUp className="h-4 w-4 shrink-0 text-cyan-300" strokeWidth={2.5} />
          <span>
            Tap here or press <span className="font-bold text-cyan-300">OK</span> on the TV remote for
            full screen
          </span>
        </>
      ) : (
        <>
          <ChevronUp className="h-4 w-4 shrink-0 text-amber-300" strokeWidth={2.5} />
          <span>
            Tap <span className="font-bold text-amber-300">↑</span> for full screen
          </span>
        </>
      )}
    </button>
  );
}
