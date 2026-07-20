import React from "react";

type VenueFullscreenHintProps = {
  visible: boolean;
  onActivate: () => void;
};

export default function VenueFullscreenHint({ visible, onActivate }: VenueFullscreenHintProps) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className="venue-fullscreen-hint fixed inset-x-0 bottom-0 z-50 px-6 py-4 bg-zinc-950/90 border-t border-zinc-800 text-center text-xs text-zinc-300"
    >
      Press <span className="font-bold text-cyan-300">OK</span> on the TV remote for full screen
    </button>
  );
}
