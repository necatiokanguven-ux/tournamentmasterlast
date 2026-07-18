import os from "os";

export function getLocalNetworkAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        addresses.push(config.address);
      }
    }
  }

  return addresses;
}

export function getPrimaryLocalAddress(): string {
  return getLocalNetworkAddresses()[0] ?? "localhost";
}

export function buildLocalUrl(port: number, pathname: string): string {
  const base = getPrimaryLocalAddress();
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `http://${base}:${port}${normalized}`;
}
