/** HTTP port for Express + QR URLs. Launcher may set TM_HTTP_PORT (Phase 11b.6). */
export function resolveServerPort(): number {
  const fromEnv = Number(process.env.TM_HTTP_PORT || process.env.PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv <= 65535) {
    return fromEnv;
  }
  return 3000;
}

export function buildLocalAppUrl(port: number, host = "localhost"): string {
  return `http://${host}:${port}`;
}
