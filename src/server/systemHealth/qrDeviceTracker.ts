const QR_STALE_MS = 60_000;
const devices = new Map<string, number>();

export function recordQrDevice(clientKey: string): void {
  if (!clientKey) return;
  devices.set(clientKey, Date.now());
}

export function countActiveQrDevices(): number {
  const now = Date.now();
  let count = 0;
  for (const [key, lastSeen] of devices) {
    if (now - lastSeen <= QR_STALE_MS) {
      count += 1;
    } else {
      devices.delete(key);
    }
  }
  return count;
}

export function clientKeyFromRequest(ip: string | undefined, userAgent: string | undefined): string {
  return `${ip ?? "unknown"}|${userAgent ?? "unknown"}`;
}
