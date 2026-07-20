import { Router } from "express";
import {
  getLocalIdScanStatus,
  IdScanProxyError,
  resolveIdScanCredentials,
  scanIdViaProxy,
} from "./pokerclupIdScanClient";

const SCAN_COOLDOWN_MS = 2_000;
const lastScanAtByIp = new Map<string, number>();

function getClientIp(req: { ip?: string; socket?: { remoteAddress?: string | null } }): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip: string): boolean {
  const lastAt = lastScanAtByIp.get(ip) ?? 0;
  return Date.now() - lastAt < SCAN_COOLDOWN_MS;
}

function markScan(ip: string) {
  lastScanAtByIp.set(ip, Date.now());
}

export function createIdScanRouter() {
  const router = Router();

  router.get("/gemini-status", async (_req, res) => {
    const status = await getLocalIdScanStatus();
    res.json(status);
  });

  router.post("/scan-id", async (req, res) => {
    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
      res.status(429).json({
        ok: false,
        error: "RATE_LIMITED",
        message: "Please wait before scanning again.",
      });
      return;
    }

    const credentials = resolveIdScanCredentials();
    if (!credentials) {
      res.status(403).json({
        ok: false,
        error: "LICENSE_REQUIRED",
        message: "Activate a valid license to use ID scan.",
      });
      return;
    }

    const imageBase64 = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "image/jpeg";

    if (!imageBase64.trim()) {
      res.status(400).json({ ok: false, error: "IMAGE_REQUIRED" });
      return;
    }

    markScan(clientIp);

    try {
      const fields = await scanIdViaProxy(credentials, imageBase64, mimeType);
      res.json({ ok: true, fields });
    } catch (error) {
      if (error instanceof IdScanProxyError) {
        if (error.code === "LICENSE_INVALID" || error.code === "LICENSE_REQUIRED") {
          res.status(403).json({
            ok: false,
            error: error.code,
            message: error.message,
          });
          return;
        }

        if (error.code === "RATE_LIMITED") {
          res.status(429).json({
            ok: false,
            error: error.code,
            message: error.message,
          });
          return;
        }

        if (error.code === "UNSUPPORTED_IMAGE_TYPE" || error.code === "IMAGE_TOO_LARGE") {
          res.status(400).json({ ok: false, error: error.code, message: error.message });
          return;
        }

        if (error.code === "UNREACHABLE" || error.code === "SERVICE_NOT_CONFIGURED" || error.code === "TIMEOUT") {
          res.status(503).json({
            ok: false,
            error: error.code,
            message: error.message,
          });
          return;
        }

        res.status(422).json({
          ok: false,
          error: error.code,
          message: error.message,
        });
        return;
      }

      res.status(422).json({
        ok: false,
        error: "SCAN_FAILED",
        message: "Could not read the ID card. Adjust lighting, align the card in the frame, and press Space again.",
      });
    }
  });

  return router;
}
