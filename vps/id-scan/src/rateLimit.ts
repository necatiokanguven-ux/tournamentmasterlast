const SCAN_COOLDOWN_MS = 2_000;
const lastScanAtByKey = new Map<string, number>();

function buildRateLimitKey(licenseKey: string, machineId: string, ip: string): string {
  return `${licenseKey.trim()}|${machineId.trim()}|${ip}`;
}

export function isScanRateLimited(licenseKey: string, machineId: string, ip: string): boolean {
  const key = buildRateLimitKey(licenseKey, machineId, ip);
  const lastAt = lastScanAtByKey.get(key) ?? 0;
  return Date.now() - lastAt < SCAN_COOLDOWN_MS;
}

export function markScanAttempt(licenseKey: string, machineId: string, ip: string): void {
  const key = buildRateLimitKey(licenseKey, machineId, ip);
  lastScanAtByKey.set(key, Date.now());

  if (lastScanAtByKey.size > 10_000) {
    const cutoff = Date.now() - SCAN_COOLDOWN_MS * 4;
    for (const [entryKey, entryAt] of lastScanAtByKey.entries()) {
      if (entryAt < cutoff) {
        lastScanAtByKey.delete(entryKey);
      }
    }
  }
}

export function getClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}
