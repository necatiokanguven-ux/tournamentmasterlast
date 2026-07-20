import { Router, type Request } from "express";
import { probeGeminiConnection, resolveGeminiApiKey, scanIdCardFromImage } from "./geminiScan";
import { verifyLicenseForScan } from "./licenseVerify";
import { getClientIp, isScanRateLimited, markScanAttempt } from "./rateLimit";

const PROBE_TTL_MS = 45_000;
let cachedGeminiConnected: boolean | null = null;
let cachedGeminiAt = 0;

async function isGeminiConnected(): Promise<boolean> {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return false;
  }

  const now = Date.now();
  if (cachedGeminiConnected !== null && now - cachedGeminiAt < PROBE_TTL_MS) {
    return cachedGeminiConnected;
  }

  try {
    cachedGeminiConnected = await probeGeminiConnection(apiKey);
  } catch {
    cachedGeminiConnected = false;
  }
  cachedGeminiAt = now;
  return cachedGeminiConnected;
}

function readLicenseQuery(req: Request): { licenseKey: string; machineId: string } | null {
  const licenseKey = typeof req.query.licenseKey === "string" ? req.query.licenseKey.trim() : "";
  const machineId = typeof req.query.machineId === "string" ? req.query.machineId.trim() : "";
  if (!licenseKey || !machineId) {
    return null;
  }
  return { licenseKey, machineId };
}

function readLicenseBody(req: Request): { licenseKey: string; machineId: string } | null {
  const licenseKey = typeof req.body?.licenseKey === "string" ? req.body.licenseKey.trim() : "";
  const machineId = typeof req.body?.machineId === "string" ? req.body.machineId.trim() : "";
  if (!licenseKey || !machineId) {
    return null;
  }
  return { licenseKey, machineId };
}

export function createIdScanRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "id-scan" });
  });

  router.get("/status", async (req, res) => {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      res.status(503).json({
        configured: false,
        connected: false,
        message: "ID scan service is not configured on PokerClup.",
      });
      return;
    }

    const credentials = readLicenseQuery(req);
    if (!credentials) {
      const connected = await isGeminiConnected();
      res.json({
        configured: true,
        connected,
        message: connected ? "Connect Gemini" : "Disconnect — cannot reach Gemini API.",
      });
      return;
    }

    const license = await verifyLicenseForScan(credentials.licenseKey, credentials.machineId);
    if (!license.valid) {
      res.status(403).json({
        configured: true,
        connected: false,
        error: "LICENSE_INVALID",
        message: license.message,
      });
      return;
    }

    const connected = await isGeminiConnected();
    res.json({
      configured: true,
      connected,
      message: connected ? "Connect Gemini" : "Disconnect — cannot reach Gemini API.",
    });
  });

  router.post("/scan", async (req, res) => {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        error: "SERVICE_NOT_CONFIGURED",
        message: "ID scan service is not configured on PokerClup.",
      });
      return;
    }

    const credentials = readLicenseBody(req);
    if (!credentials) {
      res.status(400).json({
        ok: false,
        error: "LICENSE_REQUIRED",
        message: "License key and machine ID are required.",
      });
      return;
    }

    const clientIp = getClientIp(req);
    if (isScanRateLimited(credentials.licenseKey, credentials.machineId, clientIp)) {
      res.status(429).json({
        ok: false,
        error: "RATE_LIMITED",
        message: "Please wait before scanning again.",
      });
      return;
    }

    const license = await verifyLicenseForScan(credentials.licenseKey, credentials.machineId);
    if (!license.valid) {
      res.status(403).json({
        ok: false,
        error: "LICENSE_INVALID",
        message: license.message,
      });
      return;
    }

    const imageBase64 = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "image/jpeg";
    if (!imageBase64.trim()) {
      res.status(400).json({ ok: false, error: "IMAGE_REQUIRED" });
      return;
    }

    markScanAttempt(credentials.licenseKey, credentials.machineId, clientIp);

    try {
      const fields = await scanIdCardFromImage(apiKey, imageBase64, mimeType);
      res.json({ ok: true, fields });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SCAN_FAILED";

      if (message === "UNSUPPORTED_IMAGE_TYPE" || message === "IMAGE_TOO_LARGE") {
        res.status(400).json({ ok: false, error: message });
        return;
      }

      res.status(422).json({
        ok: false,
        error: message,
        message:
          "Could not read the ID card. Adjust lighting, align the card in the frame, and try again.",
      });
    }
  });

  return router;
}
