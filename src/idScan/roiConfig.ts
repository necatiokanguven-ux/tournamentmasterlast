/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RoiInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export const DEFAULT_ROI_INSETS: RoiInsets = {
  top: 12,
  bottom: 12,
  left: 10,
  right: 10,
};

const ROI_STORAGE_KEY = "tm-id-scan-roi-insets";
const MIN_INSET = 0;
const MAX_INSET = 45;

export function clampRoiInset(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_INSET, Math.max(MIN_INSET, Math.round(value)));
}

export function normalizeRoiInsets(raw: Partial<RoiInsets> | null | undefined): RoiInsets {
  const top = clampRoiInset(raw?.top ?? DEFAULT_ROI_INSETS.top);
  const bottom = clampRoiInset(raw?.bottom ?? DEFAULT_ROI_INSETS.bottom);
  const left = clampRoiInset(raw?.left ?? DEFAULT_ROI_INSETS.left);
  const right = clampRoiInset(raw?.right ?? DEFAULT_ROI_INSETS.right);

  const horizontal = left + right;
  const vertical = top + bottom;
  if (horizontal >= 90) {
    return { ...DEFAULT_ROI_INSETS };
  }
  if (vertical >= 90) {
    return { ...DEFAULT_ROI_INSETS };
  }

  return { top, bottom, left, right };
}

export function loadRoiInsets(): RoiInsets {
  try {
    const raw = localStorage.getItem(ROI_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_ROI_INSETS };
    }
    return normalizeRoiInsets(JSON.parse(raw) as Partial<RoiInsets>);
  } catch {
    return { ...DEFAULT_ROI_INSETS };
  }
}

export function saveRoiInsets(insets: RoiInsets): void {
  localStorage.setItem(ROI_STORAGE_KEY, JSON.stringify(normalizeRoiInsets(insets)));
}

export function computeRoiRect(
  frameWidth: number,
  frameHeight: number,
  insets: RoiInsets,
): { x: number; y: number; width: number; height: number } {
  const normalized = normalizeRoiInsets(insets);
  const x = frameWidth * (normalized.left / 100);
  const y = frameHeight * (normalized.top / 100);
  const width = frameWidth * (1 - (normalized.left + normalized.right) / 100);
  const height = frameHeight * (1 - (normalized.top + normalized.bottom) / 100);

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}
