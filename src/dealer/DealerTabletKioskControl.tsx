import { useEffect } from "react";
import KioskFullscreenControl from "../components/KioskFullscreenControl";
import { applyKioskMeta } from "./useDealerKioskMode";

type DealerTabletKioskControlProps = {
  enabled?: boolean;
};

export default function DealerTabletKioskControl({ enabled = true }: DealerTabletKioskControlProps) {
  return <KioskFullscreenControl enabled={enabled} variant="tablet" />;
}

export function useDealerTabletKiosk(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove("dealer-kiosk", "dealer-tablet-landscape");
      document.body.classList.remove("dealer-kiosk", "dealer-tablet-landscape");
      return;
    }

    document.documentElement.classList.add("dealer-kiosk", "dealer-tablet-landscape");
    document.body.classList.add("dealer-kiosk", "dealer-tablet-landscape");
    applyKioskMeta("dealer-kiosk");

    return () => {
      document.documentElement.classList.remove("dealer-kiosk", "dealer-tablet-landscape");
      document.body.classList.remove("dealer-kiosk", "dealer-tablet-landscape");
    };
  }, [enabled]);
}
