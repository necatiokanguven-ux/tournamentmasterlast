/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw } from "lucide-react";
import type { GeminiStatusResponse, IdScanFields } from "../idScan/types";
import {
  computeRoiRect,
  DEFAULT_ROI_INSETS,
  loadRoiInsets,
  normalizeRoiInsets,
  saveRoiInsets,
  type RoiInsets,
} from "../idScan/roiConfig";

const GEMINI_STATUS_POLL_MS = 30_000;

type Props = {
  active: boolean;
  onResult: (fields: IdScanFields) => void;
};

function captureRoiFromVideo(video: HTMLVideoElement, insets: RoiInsets): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error("Camera not ready");
  }

  const { x, y, width, height } = computeRoiRect(vw, vh, insets);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas unavailable");
  }

  ctx.drawImage(video, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

type InsetKey = keyof RoiInsets;

const INSET_FIELDS: { key: InsetKey; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
];

export function IdScanPanel({ active, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  const [roiInsets, setRoiInsets] = useState<RoiInsets>(() => loadRoiInsets());
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatusResponse>({
    configured: false,
    connected: false,
    message: "Checking Gemini…",
  });

  useEffect(() => {
    saveRoiInsets(roiInsets);
  }, [roiInsets]);

  const updateInset = (key: InsetKey, value: number) => {
    setRoiInsets((prev) => normalizeRoiInsets({ ...prev, [key]: value }));
  };

  const resetRoiInsets = () => {
    setRoiInsets({ ...DEFAULT_ROI_INSETS });
  };

  const refreshGeminiStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/players/gemini-status");
      if (!res.ok) {
        setGeminiStatus({
          configured: false,
          connected: false,
          message: "Disconnect — license or server error.",
        });
        return;
      }

      const payload = (await res.json()) as GeminiStatusResponse;
      setGeminiStatus(payload);
    } catch {
      setGeminiStatus({
        configured: false,
        connected: false,
        message: "Disconnect — cannot reach server.",
      });
    }
  }, []);

  useEffect(() => {
    if (!active) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
        setCameraError(null);
      })
      .catch(() => {
        setCameraError("Camera access denied or unavailable.");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      return;
    }

    void refreshGeminiStatus();
    const interval = window.setInterval(() => {
      void refreshGeminiStatus();
    }, GEMINI_STATUS_POLL_MS);

    return () => window.clearInterval(interval);
  }, [active, refreshGeminiStatus]);

  const runScan = useCallback(async () => {
    if (!active || scanningRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setScanError("Camera not ready yet.");
      return;
    }

    if (!geminiStatus.connected) {
      setScanError(geminiStatus.message || "Gemini is not connected.");
      return;
    }

    scanningRef.current = true;
    setScanning(true);
    setScanError(null);

    try {
      const imageBase64 = captureRoiFromVideo(video, roiInsets);
      const res = await fetch("/api/players/scan-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
      });

      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || payload.error || "Scan failed");
      }

      onResult(payload.fields as IdScanFields);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Scan failed");
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [active, geminiStatus.connected, geminiStatus.message, onResult, roiInsets]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      void runScan();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, runScan]);

  const geminiConnected = geminiStatus.configured && geminiStatus.connected;

  return (
    <div className="space-y-3 border border-zinc-800 rounded-xl p-4 bg-zinc-950/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
          ID scan — align card in frame, press Space
        </p>
        <div
          className="flex items-center gap-2 shrink-0"
          title={geminiStatus.message}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              geminiConnected
                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
            }`}
          />
          <span
            className={`text-[10px] font-black uppercase tracking-wider ${
              geminiConnected ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {geminiConnected ? "Connect Gemini" : "Disconnect"}
          </span>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute border-2 border-amber-400 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
            style={{
              left: `${roiInsets.left}%`,
              top: `${roiInsets.top}%`,
              right: `${roiInsets.right}%`,
              bottom: `${roiInsets.bottom}%`,
            }}
          />
          <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-bold uppercase tracking-wider text-amber-300/90">
            ROI — ID card area
          </div>
        </div>

        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase">
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading ID…
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 border border-zinc-800 rounded-xl p-3 bg-zinc-900/40">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">ROI configuration (%)</p>
          <button
            type="button"
            onClick={resetRoiInsets}
            className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-amber-400 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset ROI
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {INSET_FIELDS.map(({ key, label }) => (
            <label key={key} className="space-y-1">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={45}
                  value={roiInsets[key]}
                  onChange={(event) => updateInset(key, Number(event.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <input
                  type="number"
                  min={0}
                  max={45}
                  value={roiInsets[key]}
                  onChange={(event) => updateInset(key, Number(event.target.value))}
                  className="w-12 bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-1 text-xs text-zinc-100 text-center"
                />
              </div>
            </label>
          ))}
        </div>
      </div>

      {cameraError && <p className="text-xs text-red-400">{cameraError}</p>}
      {scanError && <p className="text-xs text-red-400">{scanError}</p>}

      <button
        type="button"
        disabled={scanning || !!cameraError || !geminiConnected}
        onClick={() => void runScan()}
        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        {scanning ? "Reading ID…" : "Capture & Scan (Space)"}
      </button>
    </div>
  );
}
