type ConnectionStatusProps = {
  connected: boolean;
  connectLabel: string;
  disconnectLabel: string;
};

export default function ConnectionStatus({
  connected,
  connectLabel,
  disconnectLabel,
}: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
        aria-hidden
      />
      <span className={`text-xs font-bold uppercase ${connected ? "text-green-400" : "text-red-400"}`}>
        {connected ? connectLabel : disconnectLabel}
      </span>
    </div>
  );
}
