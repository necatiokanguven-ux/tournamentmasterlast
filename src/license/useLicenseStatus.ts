import { useCallback, useEffect, useState } from "react";
import { localApi } from "../config/api";
import type { LocalLicenseStatus } from "../license/config";

export function useLicenseStatus() {
  const [status, setStatus] = useState<LocalLicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(localApi("/api/license/status"));
      if (!response.ok) {
        setStatus({
          licenseKey: null,
          machineId: "",
          machineName: null,
          valid: false,
          message: "Could not verify license status.",
        });
        return;
      }

      const data = (await response.json()) as LocalLicenseStatus;
      setStatus(data);
    } catch {
      setStatus({
        licenseKey: null,
        machineId: "",
        machineName: null,
        valid: false,
        message: "Could not reach local license service.",
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
