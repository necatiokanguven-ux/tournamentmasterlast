import type { Request, Response, NextFunction } from "express";
import {
  getVenueDeviceMode,
  isMobileApiPath,
  isMobileRegistrationPath,
} from "./venueDeviceMode";

function isLocalRequest(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

export function createVenueDeviceModeMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isLocalRequest(req)) {
      next();
      return;
    }

    const path = req.path;
    if (!isMobileApiPath(path)) {
      next();
      return;
    }

    const venueMode = getVenueDeviceMode();

    if (venueMode === "off") {
      res.status(503).json({
        error: "VENUE_DEVICES_OFF",
        message: "Venue mobile devices are disabled. Display and director services continue.",
        venueDeviceMode: venueMode,
      });
      return;
    }

    if (venueMode === "limited" && isMobileRegistrationPath(path, req.method)) {
      res.status(503).json({
        error: "VENUE_DEVICES_LIMITED",
        message: "New mobile device connections are paused. Existing devices may continue at reduced rate.",
        venueDeviceMode: venueMode,
      });
      return;
    }

    next();
  };
}
