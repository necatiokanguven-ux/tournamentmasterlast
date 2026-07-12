import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { localApi } from "../config/api";
import { QrCode } from "lucide-react";
import type { TrackingHealthResponse } from "../tracking/types";

type TrackingQrCodeProps = {
  compact?: boolean;
};

export default function TrackingQrCode({ compact = false }: TrackingQrCodeProps) {
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTrackingUrl = async () => {
      try {
        const response = await fetch(localApi("/api/tracking/health"));
        if (!response.ok) {
          throw new Error("Tracking server unavailable.");
        }

        const data = (await response.json()) as TrackingHealthResponse;
        if (!cancelled) {
          setTrackingUrl(data.trackingUrl);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setTrackingUrl(null);
          setError(loadError instanceof Error ? loadError.message : "Failed to load QR code.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTrackingUrl();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className={`rounded-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-sm shadow-xl ${
          compact ? "p-2" : "p-3"
        }`}
        id="tracking-qr-code"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Loading QR...</p>
      </div>
    );
  }

  if (error || !trackingUrl) {
    return (
      <div
        className={`rounded-2xl border border-red-900/50 bg-zinc-950/90 backdrop-blur-sm shadow-xl ${
          compact ? "p-2" : "p-3"
        }`}
        id="tracking-qr-code"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">QR Unavailable</p>
      </div>
    );
  }

  const qrSize = compact ? 88 : 112;

  return (
    <div
      className={`rounded-2xl border border-amber-500/30 bg-zinc-950/95 backdrop-blur-sm shadow-2xl shadow-amber-500/10 ${
        compact ? "p-2.5" : "p-3"
      }`}
      id="tracking-qr-code"
      title={trackingUrl}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <QrCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 leading-none">
          Scan Your Seat
        </p>
      </div>

      <div className="rounded-xl bg-white p-1.5 mx-auto w-fit">
        <QRCodeSVG
          value={trackingUrl}
          size={qrSize}
          level="M"
          includeMargin={false}
          aria-label={`QR code for ${trackingUrl}`}
        />
      </div>

      {!compact && (
        <p className="text-[9px] text-zinc-500 font-mono mt-2 text-center break-all leading-tight max-w-[140px]">
          {trackingUrl.replace("http://", "")}
        </p>
      )}
    </div>
  );
}
