export const LICENSE_API_BASE =
  process.env.LICENSE_API_URL?.trim() || "https://api.pokerclup.com/api/licenses";

type RemoteVerifyResponse = {
  valid?: boolean;
  message?: string;
};

export async function verifyLicenseForScan(
  licenseKey: string,
  machineId: string,
): Promise<{ valid: boolean; message: string }> {
  const trimmedKey = licenseKey.trim();
  const trimmedMachineId = machineId.trim();

  if (!trimmedKey || !trimmedMachineId) {
    return { valid: false, message: "License key and machine ID are required." };
  }

  try {
    const response = await fetch(`${LICENSE_API_BASE}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey: trimmedKey, machineId: trimmedMachineId }),
    });

    const data = (await response.json()) as RemoteVerifyResponse;
    if (!response.ok || !data.valid) {
      return {
        valid: false,
        message: data.message || "License verification failed.",
      };
    }

    return { valid: true, message: "License valid." };
  } catch {
    return {
      valid: false,
      message: "Could not verify license with PokerClup.",
    };
  }
}
