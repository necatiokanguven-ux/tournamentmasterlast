/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, Loader2, RotateCcw } from "lucide-react";
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

export type CameraOption = {
  deviceId: string;
  label: string;
};

type Props = {
  active: boolean;
  onResult: (fields: IdScanFields) => void;
  cameraDeviceId?: string | null;
  onCamerasDiscovered?: (cameras: CameraOption[]) => void;
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

export function IdScanPanel({ active, onResult, cameraDeviceId, onCamerasDiscovered }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  const [roiInsets, setRoiInsets] = useState<RoiInsets>(() => loadRoiInsets());
  const [roiOpen, setRoiOpen] = useState(false);
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
          message: "Connection failed — license or server error.",
        });
        return;
      }

      const payload = (await res.json()) as GeminiStatusResponse;
      setGeminiStatus(payload);
    } catch {
      setGeminiStatus({
        configured: false,
        connected: false,
        message: "Connection failed — cannot reach server.",
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

    const videoConstraints: MediaTrackConstraints = cameraDeviceId
      ? { deviceId: { exact: cameraDeviceId } }
      : { facingMode: "environment" };

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints, audio: false })
      .then(async (media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
        setCameraError(null);

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cameras = devices
            .filter((device) => device.kind === "videoinput")
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Camera ${index + 1}`,
            }));
          onCamerasDiscovered?.(cameras);
        } catch {
          // ignore enumeration errors
        }
      })
      .catch(() => {
        setCameraError("Camera access denied or unavailable.");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active, cameraDeviceId, onCamerasDiscovered]);

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
      setScanError(geminiStatus.message || "Connection failed.");
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
    <div className="flex flex-col gap-2 border border-zinc-800 rounded-xl p-3 bg-zinc-950/60">
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-2 shrink-0" title={geminiStatus.message}>
          <span
            className={`w-2 h-2 rounded-full ${
              geminiConnected
                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
            }`}
          />
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              geminiConnected ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {geminiConnected ? "Connection successful" : "Connection failed"}
          </span>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden bg-black h-[200px]">
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

      {(cameraError || scanError) && (
        <p className="text-[11px] text-red-400 leading-snug">
          {cameraError || scanError}
        </p>
      )}

      <button
        type="button"
        disabled={scanning || !!cameraError || !geminiConnected}
        onClick={() => void runScan()}
        className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
      >
        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        {scanning ? "Reading ID…" : "Capture & Scan (Space)"}
      </button>

      <div className="border border-zinc-800 rounded-lg overflow-hidden shrink-0">
        <button
          type="button"
          onClick={() => setRoiOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900/50 hover:bg-zinc-900/80 transition text-left"
        >
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
            ROI settings
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${roiOpen ? "rotate-180" : ""}`}
          />
        </button>

        {roiOpen ? (
          <div className="px-3 pb-3 pt-1 border-t border-zinc-800 bg-zinc-900/30 space-y-2">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={resetRoiInsets}
                className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-amber-400 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset ROI
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INSET_FIELDS.map(({ key, label }) => (
                <label key={key} className="space-y-0.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={45}
                      value={roiInsets[key]}
                      onChange={(event) => updateInset(key, Number(event.target.value))}
                      className="flex-1 accent-amber-500 h-1"
                    />
                    <input
                      type="number"
                      min={0}
                      max={45}
                      value={roiInsets[key]}
                      onChange={(event) => updateInset(key, Number(event.target.value))}
                      className="w-10 bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] text-zinc-100 text-center"
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
