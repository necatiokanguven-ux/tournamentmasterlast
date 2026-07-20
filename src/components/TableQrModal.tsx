import { QRCodeSVG } from "qrcode.react";
import { QrCode, Smartphone, Tablet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { localApi } from "../config/api";

type TableQrModalProps = {
  tableNumber: number;
  onClose: () => void;
};

type QrTarget = "tablet" | "phone";

export default function TableQrModal({ tableNumber, onClose }: TableQrModalProps) {
  const [target, setTarget] = useState<QrTarget>("tablet");
  const [setupUrlTablet, setSetupUrlTablet] = useState<string | null>(null);
  const [setupUrlPhone, setSetupUrlPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadUrl = async () => {
      try {
        const response = await fetch(localApi(`/api/dealer/table/${tableNumber}/qr-url`));
        if (!response.ok) throw new Error("Could not load dealer QR.");
        const data = await response.json();
        if (!cancelled) {
          setSetupUrlTablet(data.setupUrlTablet ?? data.setupUrl ?? null);
          setSetupUrlPhone(data.setupUrlPhone ?? null);
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

  const activeUrl = target === "tablet" ? setupUrlTablet : setupUrlPhone;

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
          Choose the device type and scan the matching QR code on the dealer device.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTarget("tablet")}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-black uppercase tracking-wider transition ${
              target === "tablet"
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <Tablet className="w-4 h-4" />
            Tablet
          </button>
          <button
            type="button"
            onClick={() => setTarget("phone")}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-black uppercase tracking-wider transition ${
              target === "phone"
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Phone
          </button>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          {target === "tablet"
            ? "Landscape layout with the player list always visible."
            : "Portrait layout with a collapsible player list."}
        </p>

        {activeUrl ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-3">
              <QRCodeSVG value={activeUrl} size={220} level="M" />
            </div>
            <p className="text-[11px] font-mono text-zinc-500 break-all text-center">{activeUrl}</p>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
