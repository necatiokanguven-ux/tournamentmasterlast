import React from "react";
import TrackingLivePanel from "./TrackingLivePanel";
import TrackingMilestoneAlerts from "./TrackingMilestoneAlerts";
import { useTrackingLivePoll } from "../tracking/useTrackingLivePoll";
import { useInterpolatedTrackingLiveState } from "../tracking/useInterpolatedTrackingLiveState";
import type { PlayerStatus } from "../types";
import { isTrackingActivePlayer } from "../tracking/playerStatus";
import type { TrackingLocale, TrackingTranslations } from "../tracking/translations";

type TrackingLivePanelContainerProps = {
  t: TrackingTranslations;
  locale: TrackingLocale;
  playerStatus: PlayerStatus;
};

export default function TrackingLivePanelContainer({
  t,
  locale,
  playerStatus,
}: TrackingLivePanelContainerProps) {
  const { liveState, error } = useTrackingLivePoll(true);
  const displayLiveState = useInterpolatedTrackingLiveState(liveState);
  const showFinalTableCongrats = isTrackingActivePlayer(playerStatus);

  if (!displayLiveState) {
    return (
      <section
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 min-h-[420px]"
        id="tracking-live-panel"
        aria-hidden="true"
      />
    );
  }

  return (
    <>
      <TrackingMilestoneAlerts
        t={t}
        isBubbleTime={displayLiveState.isBubbleTime}
        isFinalTable={displayLiveState.isFinalTable}
        playersToItm={displayLiveState.playersToItm}
        showFinalTableCongrats={showFinalTableCongrats}
      />
      <TrackingLivePanel liveState={displayLiveState} t={t} />
      {error && <p className="text-sm text-red-300">{error}</p>}
    </>
  );
}
