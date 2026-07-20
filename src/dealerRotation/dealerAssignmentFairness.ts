import type { DealerStaff } from "../server/dealerRotation/types";

/** Tie-break: earlier position in pool queue wins. */
export function poolQueueOrder(aId: string, bId: string, poolQueue: string[]): number {
  const aIndex = poolQueue.indexOf(aId);
  const bIndex = poolQueue.indexOf(bId);
  const aRank = aIndex >= 0 ? aIndex : Number.MAX_SAFE_INTEGER;
  const bRank = bIndex >= 0 ? bIndex : Number.MAX_SAFE_INTEGER;
  return aRank - bRank;
}

/** Lower totalWorkMinutes first; pool queue order breaks ties. */
export function compareDealersForFairAssignment(
  a: Pick<DealerStaff, "id" | "totalWorkMinutes">,
  b: Pick<DealerStaff, "id" | "totalWorkMinutes">,
  poolQueue: string[],
): number {
  if (a.totalWorkMinutes !== b.totalWorkMinutes) {
    return a.totalWorkMinutes - b.totalWorkMinutes;
  }
  return poolQueueOrder(a.id, b.id, poolQueue);
}

export function sortDealerIdsForFairAssignment(
  dealerIds: string[],
  staffById: Map<string, Pick<DealerStaff, "id" | "totalWorkMinutes">>,
  poolQueue: string[],
): string[] {
  return [...dealerIds].sort((aId, bId) => {
    const a = staffById.get(aId);
    const b = staffById.get(bId);
    if (!a || !b) return 0;
    return compareDealersForFairAssignment(a, b, poolQueue);
  });
}

export function sortDealersForLevelOne(
  dealers: DealerStaff[],
  fairOrder: boolean,
  poolQueue: string[],
): DealerStaff[] {
  if (!fairOrder) return dealers;
  return [...dealers].sort((a, b) => compareDealersForFairAssignment(a, b, poolQueue));
}

export function pickDealerIdWithLeastWork(
  dealerIds: string[],
  getDealer: (id: string) => Pick<DealerStaff, "id" | "totalWorkMinutes"> | undefined,
  poolQueue: string[],
): string | null {
  const sorted = sortDealerIdsForFairAssignment(
    dealerIds,
    new Map(dealerIds.flatMap(id => {
      const dealer = getDealer(id);
      return dealer ? [[id, dealer] as const] : [];
    })),
    poolQueue,
  );
  return sorted[0] ?? null;
}
