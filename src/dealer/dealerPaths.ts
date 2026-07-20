export function getDealerAppPathname(): string {
  const { pathname } = window.location;

  if (pathname === "/app" || pathname === "/app/") {
    return "/";
  }

  if (pathname.startsWith("/app/")) {
    return pathname.slice(4);
  }

  return pathname;
}

export function getDealerAppPrefix(): string {
  const { pathname } = window.location;

  if (pathname === "/app" || pathname === "/app/" || pathname.startsWith("/app/")) {
    return "/app";
  }

  return "";
}

export function dealerHref(path: string): string {
  const prefix = getDealerAppPrefix();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${normalized}`;
}

export function parseDealerTableNumber(pathname = getDealerAppPathname()): number | null {
  const match = pathname.match(/^\/dealer\/(\d+)\/?$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export function isDealerSetupPath(pathname = getDealerAppPathname()): boolean {
  return pathname.startsWith("/dealer/setup");
}

export function isDealerCheckInPath(pathname = getDealerAppPathname()): boolean {
  return pathname.startsWith("/dealer/checkin");
}

export function getDealerSetupTableFromQuery(): number | null {
  const params = new URLSearchParams(window.location.search);
  const value = Number.parseInt(params.get("table") ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export type DealerDeviceType = "tablet" | "phone";

export function getDealerDeviceTypeFromQuery(): DealerDeviceType | null {
  const params = new URLSearchParams(window.location.search);
  const device = params.get("device");
  if (device === "tablet" || device === "phone") {
    return device;
  }
  return null;
}
