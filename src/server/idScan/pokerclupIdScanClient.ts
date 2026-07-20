import type { GeminiStatusResponse, IdScanFields } from "../../idScan/types";
import { getOrCreateMachineRecord, readLicenseRecord } from "../../license/licenseCore";
import { ID_SCAN_API_BASE, ID_SCAN_REQUEST_TIMEOUT_MS } from "./idScanApiConfig";

export type IdScanCredentials = {
  licenseKey: string;
  machineId: string;
  machineName: string | null;
};

export class IdScanProxyError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 502,
  ) {
    super(message);
    this.name = "IdScanProxyError";
  }
}

export function resolveIdScanCredentials(): IdScanCredentials | null {
  const license = readLicenseRecord();
  if (!license?.licenseKey?.trim()) {
    return null;
  }

  const machine = getOrCreateMachineRecord();
  return {
    licenseKey: license.licenseKey.trim(),
    machineId: machine.machineId,
    machineName: machine.machineName,
  };
}

async function parseProxyResponse<T>(response: Response): Promise<T> {
  let data: T & { error?: string; message?: string };
  try {
    data = (await response.json()) as T & { error?: string; message?: string };
  } catch {
    throw new IdScanProxyError("ID scan service returned an invalid response.", "INVALID_RESPONSE", 502);
  }
  return data;
}

function mapProxyFailure(response: Response, data: { error?: string; message?: string }): never {
  const code = data.error || "PROXY_ERROR";
  const message =
    data.message ||
    (response.status === 403
      ? "A valid license is required for ID scan."
      : response.status === 429
        ? "Please wait before scanning again."
        : response.status === 503
          ? "ID scan service is temporarily unavailable."
          : "ID scan request failed.");

  throw new IdScanProxyError(message, code, response.status);
}

export async function fetchRemoteIdScanStatus(
  credentials: IdScanCredentials,
): Promise<GeminiStatusResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ID_SCAN_REQUEST_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      licenseKey: credentials.licenseKey,
      machineId: credentials.machineId,
    });

    const response = await fetch(`${ID_SCAN_API_BASE}/status?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    const data = await parseProxyResponse<GeminiStatusResponse>(response);
    if (!response.ok) {
      mapProxyFailure(response, data);
    }

    return data;
  } catch (error) {
    if (error instanceof IdScanProxyError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new IdScanProxyError("ID scan service timed out.", "TIMEOUT", 504);
    }

    throw new IdScanProxyError(
      "Could not reach PokerClup ID scan service. Check internet connection.",
      "UNREACHABLE",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function scanIdViaProxy(
  credentials: IdScanCredentials,
  imageBase64: string,
  mimeType: string,
): Promise<IdScanFields> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ID_SCAN_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${ID_SCAN_API_BASE}/scan`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        licenseKey: credentials.licenseKey,
        machineId: credentials.machineId,
        machineName: credentials.machineName,
        imageBase64,
        mimeType,
      }),
    });

    const data = await parseProxyResponse<{ ok?: boolean; fields?: IdScanFields; error?: string; message?: string }>(
      response,
    );

    if (!response.ok || !data.ok || !data.fields) {
      mapProxyFailure(response, data);
    }

    return data.fields;
  } catch (error) {
    if (error instanceof IdScanProxyError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new IdScanProxyError("ID scan timed out.", "TIMEOUT", 504);
    }

    throw new IdScanProxyError(
      "Could not reach PokerClup ID scan service. Check internet connection.",
      "UNREACHABLE",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getLocalIdScanStatus(): Promise<GeminiStatusResponse> {
  const credentials = resolveIdScanCredentials();
  if (!credentials) {
    return {
      configured: false,
      connected: false,
      message: "Activate a valid license to use ID scan.",
    };
  }

  try {
    return await fetchRemoteIdScanStatus(credentials);
  } catch (error) {
    if (error instanceof IdScanProxyError) {
      return {
        configured: error.code !== "LICENSE_INVALID" && error.code !== "LICENSE_REQUIRED",
        connected: false,
        message: error.message,
      };
    }

    return {
      configured: true,
      connected: false,
      message: "Disconnect — cannot reach ID scan service.",
    };
  }
}
