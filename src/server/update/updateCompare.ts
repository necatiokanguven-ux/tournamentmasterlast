import semver from "semver";

export function normalizeVersion(raw: string): string | null {
  const cleaned = String(raw ?? "").trim();
  if (!cleaned) {
    return null;
  }

  const coerced = semver.coerce(cleaned);
  return coerced ? semver.valid(coerced) : null;
}

export function isNewerVersion(latestRaw: string, currentRaw: string): boolean {
  const latest = normalizeVersion(latestRaw);
  const current = normalizeVersion(currentRaw);
  if (!latest || !current) {
    return false;
  }
  return semver.gt(latest, current);
}

export function isVersionAtLeast(currentRaw: string, minimumRaw: string): boolean {
  const current = normalizeVersion(currentRaw);
  const minimum = normalizeVersion(minimumRaw);
  if (!current || !minimum) {
    return true;
  }
  return semver.gte(current, minimum);
}
