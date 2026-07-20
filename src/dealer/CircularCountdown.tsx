type CircularCountdownProps = {
  secondsRemaining: number;
  totalSeconds: number;
  ringColor: string;
  label?: string;
  diameter?: number;
  strokeWidth?: number;
};

export default function CircularCountdown({
  secondsRemaining,
  totalSeconds,
  ringColor,
  label,
  diameter = 224,
  strokeWidth = 14,
}: CircularCountdownProps) {
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? secondsRemaining / totalSeconds : 0;
  const dashOffset = circumference * (1 - progress);
  const viewBoxSize = diameter;

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {label ? (
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-400">{label}</p>
      ) : null}
      <div className="relative" style={{ width: diameter, height: diameter }}>
        <svg
          className="absolute inset-0 -rotate-90"
          viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
          width={diameter}
          height={diameter}
        >
          <circle
            cx={viewBoxSize / 2}
            cy={viewBoxSize / 2}
            r={radius}
            stroke="#27272a"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={viewBoxSize / 2}
            cy={viewBoxSize / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-black text-white tabular-nums leading-none"
            style={{ fontSize: diameter >= 140 ? "3.5rem" : "3.75rem" }}
          >
            {secondsRemaining}
          </span>
        </div>
      </div>
    </div>
  );
}
