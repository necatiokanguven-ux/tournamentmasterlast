import { useEffect, useState } from "react";
import { localApi } from "../config/api";

export function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  const [build, setBuild] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetch(localApi("/api/app/version"))
      .then(response => (response.ok ? response.json() : null))
      .then(payload => {
        if (cancelled || !payload) {
          return;
        }
        setVersion(typeof payload.version === "string" ? payload.version : null);
        setBuild(typeof payload.build === "string" ? payload.build : null);
      })
      .catch(() => {
        if (!cancelled) {
          setVersion(null);
          setBuild(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { version, build, loading };
}
