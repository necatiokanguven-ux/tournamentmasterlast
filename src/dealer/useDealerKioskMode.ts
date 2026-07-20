import { useEffect } from "react";

const TV_FULLSCREEN_KEYS = new Set([
  "Enter",
  " ",
  "MediaPlayPause",
  "MediaSelect",
  "Select",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const TV_FULLSCREEN_KEY_CODES = new Set([13, 32, 461, 415, 412, 19, 37, 38, 39, 40]);

function isTvFullscreenKey(event: KeyboardEvent) {
  return TV_FULLSCREEN_KEYS.has(event.key) || TV_FULLSCREEN_KEY_CODES.has(event.keyCode);
}

function applyKioskMeta(rootClass: string) {
  document.documentElement.classList.add(rootClass);
  document.body.classList.add(rootClass);

  let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    document.head.appendChild(themeMeta);
  }
  themeMeta.content = "#0B0B0B";

  let appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]') as HTMLMetaElement | null;
  if (!appleCapable) {
    appleCapable = document.createElement("meta");
    appleCapable.name = "apple-mobile-web-app-capable";
    appleCapable.content = "yes";
    document.head.appendChild(appleCapable);
  }

  let appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') as HTMLMetaElement | null;
  if (!appleStatus) {
    appleStatus = document.createElement("meta");
    appleStatus.name = "apple-mobile-web-app-status-bar-style";
    appleStatus.content = "black-translucent";
    document.head.appendChild(appleStatus);
  }

  let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (viewportMeta) {
    viewportMeta.content =
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
  }
}

async function requestAppFullscreen() {
  const element = document.documentElement;

  if (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) {
    return true;
  }

  const candidates: Array<() => Promise<void> | void> = [
    () => element.requestFullscreen?.(),
    () => (element as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.(),
    () => (element as HTMLElement & { webkitRequestFullScreen?: () => void }).webkitRequestFullScreen?.(),
    () => (element as HTMLElement & { msRequestFullscreen?: () => Promise<void> }).msRequestFullscreen?.(),
    () => document.body.requestFullscreen?.(),
    () => (document.body as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.(),
  ];

  for (const attempt of candidates) {
    try {
      const result = attempt();
      if (result instanceof Promise) {
        await result;
      }
      if (
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
      ) {
        return true;
      }
    } catch {
      // Browser blocked auto-fullscreen; first tap handler will retry.
    }
  }

  return false;
}

function nudgeBrowserChromeHidden() {
  window.scrollTo(0, 1);
  window.setTimeout(() => window.scrollTo(0, 0), 50);
}

export function useAppKioskMode(rootClass = "dealer-kiosk") {
  useEffect(() => {
    applyKioskMeta(rootClass);

    void requestAppFullscreen();
    nudgeBrowserChromeHidden();

    const enterOnInteraction = () => {
      void requestAppFullscreen();
      nudgeBrowserChromeHidden();
    };

    const enterOnKey = (event: KeyboardEvent) => {
      if (!isTvFullscreenKey(event)) {
        return;
      }
      event.preventDefault();
      enterOnInteraction();
    };

    document.addEventListener("click", enterOnInteraction, { passive: true });
    document.addEventListener("touchstart", enterOnInteraction, { passive: true });
    document.addEventListener("keydown", enterOnKey);

    return () => {
      document.documentElement.classList.remove(rootClass);
      document.body.classList.remove(rootClass);
      document.removeEventListener("click", enterOnInteraction);
      document.removeEventListener("touchstart", enterOnInteraction);
      document.removeEventListener("keydown", enterOnKey);
    };
  }, [rootClass]);
}

export function useDealerKioskMode() {
  useAppKioskMode("dealer-kiosk");
}

export { requestAppFullscreen, nudgeBrowserChromeHidden };
