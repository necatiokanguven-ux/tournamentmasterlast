type DealerPhoneSessionBarProps = {
  dutyLabel: string;
};

/** Persistent duty line — visible for the whole phone session. */
export default function DealerPhoneSessionBar({ dutyLabel }: DealerPhoneSessionBarProps) {
  return (
    <div className="fixed top-0 inset-x-0 z-[250] border-b border-amber-500/40 bg-zinc-950/95 px-4 py-3 backdrop-blur-md safe-area-inset-top">
      <p className="text-center text-xs font-black uppercase tracking-[0.12em] text-amber-300">
        {dutyLabel}
      </p>
    </div>
  );
}
