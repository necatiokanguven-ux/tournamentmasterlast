import React, { memo } from "react";
import type { TrackingTranslations } from "../tracking/translations";

type TrackingMilestoneAlertsProps = {
  t: TrackingTranslations;
  isBubbleTime: boolean;
  isFinalTable: boolean;
  playersToItm: number;
  showFinalTableCongrats: boolean;
};

function TrackingMilestoneAlerts({
  t,
  isBubbleTime,
  isFinalTable,
  playersToItm,
  showFinalTableCongrats,
}: TrackingMilestoneAlertsProps) {
  if (!isBubbleTime && !(isFinalTable && showFinalTableCongrats)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {isBubbleTime && (
        <section className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden="true">
              🟡
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-yellow-200">{t.bubbleTime}</p>
              <p className="text-sm text-yellow-100/90 mt-1">{t.bubblePlayersLeft(playersToItm)}</p>
            </div>
          </div>
        </section>
      )}

      {isFinalTable && showFinalTableCongrats && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden="true">
              🏆
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-200">
                {t.finalTableCongratulations}
              </p>
              <p className="text-sm text-amber-100/90 mt-1">{t.finalTableReached}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default memo(TrackingMilestoneAlerts);
