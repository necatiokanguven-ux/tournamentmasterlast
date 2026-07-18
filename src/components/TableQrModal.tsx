import { QRCodeSVG } from "qrcode.react";
import { QrCode, X } from "lucide-react";
import { useEffect, useState } from "react";
import { localApi } from "../config/api";

type TableQrModalProps = {
  tableNumber: number;
  onClose: () => void;
};

export default function TableQrModal({ tableNumber, onClose }: TableQrModalProps) {
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadUrl = async () => {
      try {
        const response = await fetch(localApi(`/api/dealer/table/${tableNumber}/qr-url`));
        if (!response.ok) throw new Error("Could not load dealer QR.");
        const data = await response.json();
        if (!cancelled) {
          setSetupUrl(data.setupUrl ?? null);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load dealer QR.");
        }
      }
    };

    void loadUrl();
    return () => {
      cancelled = true;
    };
  }, [tableNumber]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-amber-400">
          <QrCode className="w-5 h-5" />
          <h2 className="text-lg font-black uppercase tracking-wider">Table {tableNumber} QR</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          Scan this QR on the dealer tablet to bind it to Table {tableNumber}.
        </p>

        {setupUrl ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-3">
              <QRCodeSVG value={setupUrl} size={220} level="M" />
            </div>
            <p className="text-[11px] font-mono text-zinc-500 break-all text-center">{setupUrl}</p>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
