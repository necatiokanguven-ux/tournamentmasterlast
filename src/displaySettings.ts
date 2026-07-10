/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export interface DisplayPreset {
  id: string;
  name: string;
  label: string;
  width: number;
  height: number;
  description: string;
}

export interface DisplaySettings {
  targetWidth: number;
  targetHeight: number;
  presetId: string;
  presetName: string;
}

export const DISPLAY_PRESETS: DisplayPreset[] = [
  { id: "fhd", name: "Full HD", label: "1920 × 1080", width: 1920, height: 1080, description: "Standard tournament screen / projection" },
  { id: "qhd", name: "QHD 2K", label: "2560 × 1440", width: 2560, height: 1440, description: "High-resolution LED panel" },
  { id: "4k", name: "4K UHD", label: "3840 × 2160", width: 3840, height: 2160, description: "Large venue main display" },
  { id: "hd", name: "HD 720p", label: "1280 × 720", width: 1280, height: 720, description: "Small side monitor / tablet" },
  { id: "laptop", name: "Laptop", label: "1366 × 768", width: 1366, height: 768, description: "Laptop display output" },
  { id: "ultrawide", name: "UltraWide", label: "3440 × 1440", width: 3440, height: 1440, description: "Wide-format LED wall" },
  { id: "portrait", name: "Portrait Panel", label: "1080 × 1920", width: 1080, height: 1920, description: "Vertically mounted displays" },
  { id: "custom", name: "Custom", label: "Custom", width: 1920, height: 1080, description: "Manual resolution input" },
];

const STORAGE_KEY = "tournament-display-settings";

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  targetWidth: 1920,
  targetHeight: 1080,
  presetId: "fhd",
  presetName: "Full HD",
};

export function getDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS };
    const parsed = JSON.parse(raw) as DisplaySettings;
    return {
      targetWidth: Number(parsed.targetWidth) || DEFAULT_DISPLAY_SETTINGS.targetWidth,
      targetHeight: Number(parsed.targetHeight) || DEFAULT_DISPLAY_SETTINGS.targetHeight,
      presetId: parsed.presetId || DEFAULT_DISPLAY_SETTINGS.presetId,
      presetName: parsed.presetName || DEFAULT_DISPLAY_SETTINGS.presetName,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("display-settings-changed", { detail: settings }));
}

export function calcDisplayScale(
  viewportWidth: number,
  viewportHeight: number,
  settings?: DisplaySettings
): number {
  const target = settings ?? getDisplaySettings();
  const widthScale = viewportWidth / DESIGN_WIDTH;
  const heightScale = viewportHeight / DESIGN_HEIGHT;
  const fitScale = Math.min(widthScale, heightScale);

  if (target.presetId === "custom") {
    return fitScale;
  }

  const targetScale = Math.min(target.targetWidth / DESIGN_WIDTH, target.targetHeight / DESIGN_HEIGHT);
  return Math.min(fitScale, targetScale);
}

export function getPresetById(id: string): DisplayPreset {
  return DISPLAY_PRESETS.find((preset) => preset.id === id) ?? DISPLAY_PRESETS[0];
}
