import { useEffect, useState } from "react";

/** Phase 11b.6.7 — show active venue port for QR/LAN URLs when not default 3000. */
export default function VenuePortHint() {
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
    const host = window.location.hostname;
    const base = `${window.location.protocol}//${host}${port ? `:${port}` : ""}`;

    if (port && port !== "3000") {
      setHint(`Venue server on port ${port}. QR / LAN base URL: ${base}`);
      return;
    }

    if (host !== "localhost" && host !== "127.0.0.1") {
      setHint(`LAN base URL for phones: ${base}`);
    }
  }, []);

  if (!hint) return null;

  return (
    <div className="bg-sky-500/10 border-b border-sky-500/25 px-4 py-2 text-sky-200 text-xs font-mono">
      {hint}
    </div>
  );
}
