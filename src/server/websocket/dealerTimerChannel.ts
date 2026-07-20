import type { DealerTimerSnapshot } from "../../dealer/dealerTimerTypes";

export type DealerTimerChannelPayload = {
  tableNumber: number;
  dealerTimer: DealerTimerSnapshot;
};

export function parseDealerTimerChannel(channel: string): number | null {
  const match = channel.match(/^dealer-timer:(\d+)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function dealerTimerChannelForTable(tableNumber: number): string {
  return `dealer-timer:${tableNumber}`;
}

export function buildDealerTimerChannelPayload(
  tableNumber: number,
  dealerTimer: DealerTimerSnapshot,
): DealerTimerChannelPayload {
  return { tableNumber, dealerTimer };
}
