type DealerPhoneSessionBarProps = {
  dutyLabel: string;
  changeDealerHref?: string;
  onChangeDealer?: () => void;
};

/** Persistent duty line — visible for the whole phone session. */
export default function DealerPhoneSessionBar({
  dutyLabel,
  changeDealerHref,
  onChangeDealer,
}: DealerPhoneSessionBarProps) {
  return (
    <div className="fixed top-0 inset-x-0 z-[250] border-b border-amber-500/40 bg-zinc-950/95 px-4 py-3 backdrop-blur-md safe-area-inset-top">
      <p className="text-center text-xs font-black uppercase tracking-[0.12em] text-amber-300">
        {dutyLabel}
      </p>
      {onChangeDealer ? (
        <button
          type="button"
          onClick={onChangeDealer}
          className="mt-1 block w-full text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
        >
          Wrong name? Change dealer
        </button>
      ) : changeDealerHref ? (
        <a
          href={changeDealerHref}
          className="mt-1 block text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
        >
          Wrong name? Change dealer
        </a>
      ) : null}
    </div>
  );
}
