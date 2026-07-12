import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { isCloudHostedApp, localApi } from "../config/api";

export default function LocalServerBanner() {
  const [localServerOnline, setLocalServerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isCloudHostedApp()) {
      return;
    }

    let cancelled = false;

    const checkLocalServer = async () => {
      try {
        const response = await fetch(localApi("/api/tracking/ping"));
        if (!cancelled) {
          setLocalServerOnline(response.ok);
        }
      } catch {
        if (!cancelled) {
          setLocalServerOnline(false);
        }
      }
    };

    void checkLocalServer();
    const timer = window.setInterval(() => {
      void checkLocalServer();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!isCloudHostedApp() || localServerOnline !== false) {
    return null;
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 text-amber-200 text-sm flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
      <p>
        Local tournament server is not running on this PC. Start the Tournament Master local server
        (port 3000) to save tournament data and enable QR Live Tracking. License activation works in
        the browser via <strong className="text-amber-100">License Key</strong>.
      </p>
    </div>
  );
}
