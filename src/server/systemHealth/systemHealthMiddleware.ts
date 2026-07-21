import type { Request, Response, NextFunction } from "express";
import {
  classifyRequestPath,
  recordHttpRequest,
} from "./httpMetrics";
import {
  clientKeyFromRequest,
  countActiveQrDevices,
  recordQrDevice,
} from "./qrDeviceTracker";

export function createSystemHealthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/") && !req.path.startsWith("/track")) {
      next();
      return;
    }

    const started = Date.now();
    const channel = classifyRequestPath(req.path, req.get("user-agent"));

    if (channel === "tracking") {
      const isPlayerTrackingClient =
        req.path.startsWith("/track")
        || req.path === "/api/tracking/players"
        || req.path === "/api/tracking/ping"
        || req.path === "/api/tracking/payouts"
        || req.path === "/api/tracking/status";

      if (isPlayerTrackingClient) {
        const clientKey = clientKeyFromRequest(
          req.ip || req.socket.remoteAddress,
          req.get("user-agent"),
        );
        recordQrDevice(clientKey);
      }
    }

    res.on("finish", () => {
      const durationMs = Date.now() - started;
      const isError = res.statusCode >= 500;
      recordHttpRequest(channel, durationMs, isError);
    });

    next();
  };
}

// Keep QR tracker reachable for tests
export { countActiveQrDevices };
