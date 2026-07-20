import type { BlindLevel } from "./types";

/** Count of playing (non-break) levels from structure start through index (inclusive). */
export function getPlayingLevelNumber(structure: BlindLevel[], index: number): number {
  if (!structure.length || index < 0) {
    return 1;
  }

  const clampedIndex = Math.min(index, structure.length - 1);
  return Math.max(
    1,
    structure.slice(0, clampedIndex + 1).filter((level) => !level.isBreak).length,
  );
}

export function getNextStructureEntry(
  structure: BlindLevel[],
  currentIndex: number,
): BlindLevel | null {
  return structure[currentIndex + 1] ?? null;
}

export function getNextNonBreakLevel(
  structure: BlindLevel[],
  startIndex: number,
): BlindLevel | null {
  for (let i = startIndex; i < structure.length; i++) {
    if (!structure[i]?.isBreak) {
      return structure[i];
    }
  }
  return null;
}

export function formatBreakDuration(minutes: number): string {
  return `${minutes} MIN`;
}

export type NextLevelDisplay = {
  isBreak: boolean;
  label: string;
  detail: string;
  playingLevelNumber: number | null;
};

export function getNextLevelDisplay(
  structure: BlindLevel[],
  currentIndex: number,
): NextLevelDisplay | null {
  const next = getNextStructureEntry(structure, currentIndex);
  if (!next) {
    return null;
  }

  if (next.isBreak) {
    return {
      isBreak: true,
      label: "BREAK",
      detail: formatBreakDuration(next.duration),
      playingLevelNumber: null,
    };
  }

  const playingLevelNumber = getPlayingLevelNumber(structure, currentIndex + 1);
  const blinds =
    next.ante > 0
      ? `${next.smallBlind.toLocaleString()} / ${next.bigBlind.toLocaleString()} (${next.ante.toLocaleString()})`
      : `${next.smallBlind.toLocaleString()} / ${next.bigBlind.toLocaleString()}`;

  return {
    isBreak: false,
    label: String(playingLevelNumber),
    detail: blinds,
    playingLevelNumber,
  };
}
