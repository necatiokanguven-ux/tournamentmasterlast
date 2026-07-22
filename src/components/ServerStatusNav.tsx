import { Loader2, RefreshCw } from "lucide-react";
import type { LocalServerStatus } from "../hooks/useLocalServerStatus";

type ServerStatusNavProps = {
  collapsed: boolean;
  status: LocalServerStatus;
  showRestartButton: boolean;
  restartBusy: boolean;
  restartMessage: string | null;
  onRestart: () => void;
};

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {online ? (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
      ) : null}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
          online ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
    </span>
  );
}

export default function ServerStatusNav({
  collapsed,
  status,
  showRestartButton,
  restartBusy,
  restartMessage,
  onRestart,
}: ServerStatusNavProps) {
  if (collapsed) {
    return (
      <div className="px-2 py-2 border-b border-zinc-800/80 flex flex-col items-center gap-2">
        {status === "online" ? (
          <span title="Server active">
            <StatusDot online />
          </span>
        ) : status === "recovering" || restartBusy ? (
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" title="Restarting server" />
        ) : showRestartButton ? (
          <button
            type="button"
            onClick={onRestart}
            className="p-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30"
            title="Restart server"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        ) : (
          <span title="Server disconnected">
            <StatusDot online={false} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-2 border-b border-zinc-800/80 space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        {status === "online" ? (
          <>
            <StatusDot online />
            <span className="font-black tracking-wider uppercase text-xs text-emerald-400 truncate">
              Server Active
            </span>
          </>
        ) : status === "recovering" || restartBusy ? (
          <>
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span className="font-black tracking-wider uppercase text-xs text-amber-300 truncate">
              Restarting Server
            </span>
          </>
        ) : status === "checking" ? (
          <span className="font-black tracking-wider uppercase text-xs text-zinc-500">
            Checking server…
          </span>
        ) : (
          <>
            <StatusDot online={false} />
            <span className="font-black tracking-wider uppercase text-xs text-red-400 truncate">
              Server Disconnected
            </span>
          </>
        )}
      </div>

      {showRestartButton ? (
        <button
          type="button"
          onClick={onRestart}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-500/15 px-3 py-2 text-xs font-black uppercase tracking-wider text-red-200 hover:bg-red-500/25 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Restart Server
        </button>
      ) : null}

      {restartMessage ? (
        <p className="text-[10px] leading-snug text-zinc-500">{restartMessage}</p>
      ) : null}
    </div>
  );
}
