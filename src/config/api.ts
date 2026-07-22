const LOCAL_SERVER_ORIGIN = "http://127.0.0.1:3000";

const CLOUD_APP_HOSTS = new Set(["app.pokerclup.com"]);

function isPrivateLanHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

export function isCloudHostedApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const { hostname, pathname, port } = window.location;

  if (CLOUD_APP_HOSTS.has(hostname)) {
    return true;
  }

  if (hostname === "pokerclup.com" && pathname.startsWith("/app")) {
    return true;
  }

  if (hostname === "www.pokerclup.com" && pathname.startsWith("/app")) {
    return true;
  }

  if (hostname === "localhost" && port === "5174") {
    return true;
  }

  return false;
}

export function getLocalApiBase(): string {
  if (typeof window === "undefined") {
    return "";
  }

  if (isCloudHostedApp()) {
    return LOCAL_SERVER_ORIGIN;
  }

  const { hostname } = window.location;

  if (isPrivateLanHost(hostname)) {
    return "";
  }

  return "";
}

export function localApi(path: string): string {
  const base = getLocalApiBase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function localWsApi(path: string): string {
  const httpUrl = localApi(path);
  if (httpUrl.startsWith("http://")) {
    return httpUrl.replace(/^http:\/\//, "ws://");
  }
  if (httpUrl.startsWith("https://")) {
    return httpUrl.replace(/^https:\/\//, "wss://");
  }

  if (typeof window === "undefined") {
    return path;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}//${window.location.host}${normalizedPath}`;
}

export const LOCAL_SERVER_PORT = 3000;
export const LOCAL_WATCHDOG_PORT = 3099;

export function isDirectorOnServerMachine(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function localWatchdogApi(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `http://127.0.0.1:${LOCAL_WATCHDOG_PORT}${normalizedPath}`;
}
