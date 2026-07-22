import { appendUpdateLog } from "./updateLog";

const MANIFEST_URLS = [
  "https://api.pokerclup.com/update.json",
  "https://pokerclup.com/downloads/update.json",
];

export interface PlatformUpdateInfo {
  url: string;
  sha256: string;
  sizeBytes?: number;
}

export interface UpdateManifest {
  version: string;
  mandatory: boolean;
  minSupportedVersion?: string;
  releasedAt?: string;
  notes: string[];
  platform: PlatformUpdateInfo;
}

interface RawManifest {
  version?: string;
  mandatory?: boolean;
  minSupportedVersion?: string;
  releasedAt?: string;
  url?: string;
  sha256?: string;
  sizeBytes?: number;
  notes?: string[] | string;
  platforms?: {
    win?: Partial<PlatformUpdateInfo>;
    mac?: Partial<PlatformUpdateInfo>;
  };
}

function normalizeNotes(raw: RawManifest["notes"]): string[] {
  if (Array.isArray(raw)) {
    return raw.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  return [];
}

function resolvePlatformInfo(raw: RawManifest, platform: "win" | "mac"): PlatformUpdateInfo | null {
  const fromPlatforms = raw.platforms?.[platform];
  const url = fromPlatforms?.url ?? (platform === "win" ? raw.url : undefined);
  const sha256 = fromPlatforms?.sha256 ?? (platform === "win" ? raw.sha256 : undefined);
  const sizeBytes = fromPlatforms?.sizeBytes ?? (platform === "win" ? raw.sizeBytes : undefined);

  if (!url || !sha256) {
    return null;
  }

  return {
    url: String(url),
    sha256: String(sha256).toLowerCase(),
    sizeBytes: typeof sizeBytes === "number" ? sizeBytes : undefined,
  };
}

function parseManifest(raw: RawManifest, platform: "win" | "mac"): UpdateManifest | null {
  const version = String(raw.version ?? "").trim();
  const platformInfo = resolvePlatformInfo(raw, platform);
  if (!version || !platformInfo) {
    return null;
  }

  return {
    version,
    mandatory: Boolean(raw.mandatory),
    minSupportedVersion: raw.minSupportedVersion ? String(raw.minSupportedVersion) : undefined,
    releasedAt: raw.releasedAt ? String(raw.releasedAt) : undefined,
    notes: normalizeNotes(raw.notes),
    platform: platformInfo,
  };
}

export async function fetchUpdateManifest(platform: "win" | "mac" = "win"): Promise<UpdateManifest | null> {
  let lastError: unknown;

  for (const url of MANIFEST_URLS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = (await response.json()) as RawManifest;
      const manifest = parseManifest(raw, platform);
      if (!manifest) {
        throw new Error("Invalid manifest schema");
      }

      appendUpdateLog(`CHECK manifest ok url=${url} latest=${manifest.version}`);
      return manifest;
    } catch (error) {
      lastError = error;
      appendUpdateLog(`CHECK manifest failed url=${url} error=${String(error)}`);
    }
  }

  console.warn("[update] Could not fetch update manifest:", lastError);
  return null;
}
