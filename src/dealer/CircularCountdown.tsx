import { useEffect, useState } from "react";

type CircularCountdownProps = {
  secondsRemaining: number;
  totalSeconds: number;
  ringColor: string;
  label?: string;
};

export default function CircularCountdown({
  secondsRemaining,
  totalSeconds,
  ringColor,
  label,
}: CircularCountdownProps) {
  const [previousSecond, setPreviousSecond] = useState(secondsRemaining);
  const [animating, setAnimating] = useState(false);
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? secondsRemaining / totalSeconds : 0;
  const dashOffset = circumference * (1 - progress);

  useEffect(() => {
    if (secondsRemaining === previousSecond) return;
    setAnimating(true);
    const timer = window.setTimeout(() => {
      setPreviousSecond(secondsRemaining);
      setAnimating(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [secondsRemaining, previousSecond]);

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {label ? (
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-400">{label}</p>
      ) : null}
      <div className="relative w-56 h-56">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={radius} stroke="#27272a" strokeWidth="14" fill="none" />
          <circle
            cx="100"
            cy="100"
            r={radius}
            stroke={ringColor}
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className={`relative h-16 w-full transition-transform duration-200 ${animating ? "-translate-y-2" : ""}`}>
            <span className="absolute inset-0 flex items-center justify-center text-6xl font-black text-white tabular-nums">
              {secondsRemaining}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
