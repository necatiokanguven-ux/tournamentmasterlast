import { useEffect, useState } from "react";
import DealerSetupView, { readStoredConfig } from "./DealerSetupView";
import DealerTabletView from "./DealerTabletView";

function parseDealerTableNumber(pathname: string): number | null {
  const match = pathname.match(/^\/dealer\/(\d+)\/?$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export default function DealerShell() {
  const [tableNumber, setTableNumber] = useState<number | null>(() => {
    const fromPath = parseDealerTableNumber(window.location.pathname);
    if (fromPath) return fromPath;
    return readStoredConfig()?.tableNumber ?? null;
  });
  const isSetupPath = window.location.pathname.startsWith("/dealer/setup");

  useEffect(() => {
    if (isSetupPath) return;
    const fromPath = parseDealerTableNumber(window.location.pathname);
    if (fromPath) {
      setTableNumber(fromPath);
    }
  }, [isSetupPath]);

  if (isSetupPath || !tableNumber) {
    return <DealerSetupView onConfigured={setTableNumber} />;
  }

  return <DealerTabletView tableNumber={tableNumber} />;
}
