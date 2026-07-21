import type { DealerNotification, DealerStaff } from "../dealerRotation/types";
import { getDealerPhoneAction, type DealerPhoneAction } from "../../dealer/dealerPhoneActions";
import { getTournamentBreakStatus, type TournamentBreakStatus } from "../dealerRotation/RotationTriggerService";
import type { TournamentDatabase } from "../tournamentDatabase";
import { buildDealerControlStatePayload } from "./dealerControlChannel";

export type DealerPhoneChannelPayload = {
  version: number;
  dealerId: string;
  serverTime: number;
  tBreakMinutes: number;
  tDealMinutes: number;
  tournamentBreak: TournamentBreakStatus;
  dealer: DealerStaff | null;
  action: DealerPhoneAction;
};

export function parseDealerPhoneChannel(channel: string): string | null {
  const match = channel.match(/^dealer-phone:(.+)$/);
  return match?.[1]?.trim() || null;
}

export function buildDealerPhoneChannelPayload(
  db: TournamentDatabase,
  dealerId: string,
  latestNotification?: DealerNotification | null,
): DealerPhoneChannelPayload | null {
  const dealer = db.dealerRotation.staff.find(entry => entry.id === dealerId) ?? null;
  const now = Date.now();
  const tournamentBreak = getTournamentBreakStatus(db.settings, db.clock, now);
  const tBreakMinutes = db.dealerRotation.settings.tBreakMinutes;
  const tDealMinutes = db.dealerRotation.settings.tDealMinutes;

  let latestNote = latestNotification ?? null;
  if (!latestNote) {
    latestNote = db.dealerRotation.notifications
      .filter(note => note.dealerId === dealerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
  }

  return {
    version: db.meta.lastModified,
    dealerId,
    serverTime: now,
    tBreakMinutes,
    tDealMinutes,
    tournamentBreak,
    dealer,
    action: dealer
      ? getDealerPhoneAction(dealer, latestNote, {
          tournamentBreak,
          staff: db.dealerRotation.staff,
          serverTime: now,
        })
      : { kind: "none" },
  };
}

export { buildDealerControlStatePayload, parseDealerControlChannel } from "./dealerControlChannel";
