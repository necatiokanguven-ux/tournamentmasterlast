import { useCallback, useEffect, useState } from "react";
import type { LocalLicenseStatus } from "../license/config";
import { fetchLicenseStatus } from "./licenseClient";

export function useLicenseStatus() {
  const [status, setStatus] = useState<LocalLicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLicenseStatus();
      setStatus(data);
    } catch {
      setStatus({
        licenseKey: null,
        machineId: "",
        machineName: null,
        valid: false,
        message: "Could not verify license status.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const handleUpdate = () => {
      void refresh();
    };

    window.addEventListener("license-updated", handleUpdate);
    return () => window.removeEventListener("license-updated", handleUpdate);
  }, [refresh]);

  return {
    status,
    loading,
    isLicensed: Boolean(status?.valid),
    refresh,
  };
}
