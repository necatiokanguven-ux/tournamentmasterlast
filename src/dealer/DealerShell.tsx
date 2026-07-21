import { useCallback, useState, useEffect } from "react";
import DealerSetupView, { readStoredConfig } from "./DealerSetupView";
import DealerTabletView from "./DealerTabletView";
import DealerCheckInView from "./DealerCheckInView";
import { useDealerTabletKiosk } from "./DealerTabletKioskControl";
import {
  getDealerDeviceTypeFromQuery,
  getDealerAppPathname,
  isDealerCheckInPath,
  isDealerSetupPath,
  parseDealerTableNumber,
} from "./dealerPaths";

type DealerScreen = "setup" | "tablet" | "checkin";

function resolveInitialScreen(): DealerScreen {
  const pathname = getDealerAppPathname();

  if (isDealerCheckInPath(pathname)) {
    return "checkin";
  }

  if (parseDealerTableNumber(pathname)) {
    return "tablet";
  }

  if (isDealerSetupPath(pathname)) {
    return "setup";
  }

  return readStoredConfig()?.setupLocked ? "tablet" : "setup";
}

function resolveInitialTableNumber(): number | null {
  const fromPath = parseDealerTableNumber(getDealerAppPathname());
  if (fromPath) return fromPath;
  return readStoredConfig()?.tableNumber ?? null;
}

export default function DealerShell() {
  const [screen, setScreen] = useState<DealerScreen>(resolveInitialScreen);
  const [tableNumber, setTableNumber] = useState<number | null>(resolveInitialTableNumber);
  const deviceType = getDealerDeviceTypeFromQuery() ?? readStoredConfig()?.deviceType ?? "tablet";
  const isTabletKiosk = screen === "tablet" && deviceType !== "phone";

  useDealerTabletKiosk(isTabletKiosk);

  useEffect(() => {
    document.documentElement.lang = "en";
  }, []);

  const handleConfigured = useCallback((nextTableNumber: number) => {
    setTableNumber(nextTableNumber);
    setScreen("tablet");
  }, []);

  if (screen === "checkin") {
    return <DealerCheckInView />;
  }

  if (screen === "setup" || !tableNumber) {
    return <DealerSetupView onConfigured={handleConfigured} />;
  }

  return <DealerTabletView tableNumber={tableNumber} deviceType={deviceType} />;
}
