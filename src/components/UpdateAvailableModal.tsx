import React from "react";
import { Download, RefreshCw, ShieldAlert, X } from "lucide-react";
import type { useAppUpdate } from "../hooks/useAppUpdate";

type AppUpdateController = ReturnType<typeof useAppUpdate>;

interface UpdateAvailableModalProps {
  update: AppUpdateController;
}

export default function UpdateAvailableModal({ update }: UpdateAvailableModalProps) {
  const { visible, checkResult, uiPhase, busy, message, dismiss, startDownload, applyUpdate } = update;

  if (!visible || !checkResult) {
    return null;
  }

  const canDismiss = !checkResult.mandatory;
  const progress = checkResult.state?.downloadPercent ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id="update-modal-title" className="text-lg font-black uppercase tracking-wide text-zinc-100">
              Tournament Master Update Available
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Keep your venue software current with verified updates.
            </p>
          </div>
          {canDismiss && uiPhase !== "installing" ? (
            <button
              type="button"
              onClick={() => void dismiss()}
              disabled={busy}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Dismiss update"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="space-y-4 px-6 py-5 text-sm text-zinc-300">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">Current Version</div>
              <div className="mt-1 text-base font-bold text-zinc-100">{checkResult.currentVersion}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">Latest Version</div>
              <div className="mt-1 text-base font-bold text-emerald-400">{checkResult.latestVersion ?? "—"}</div>
            </div>
          </div>

          {checkResult.notes.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Changes</div>
              <ul className="space-y-2">
                {checkResult.notes.map(note => (
                  <li key={note} className="flex gap-2 text-zinc-300">
                    <span className="text-emerald-400">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {uiPhase === "downloading" ? (
            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-zinc-500">
                <span>Downloading update</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.max(progress, 5)}%` }}
                />
              </div>
            </div>
          ) : null}

          {uiPhase === "ready" ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-100">
              Update downloaded and verified. You can install it now.
            </div>
          ) : null}

          {uiPhase === "installing" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100">
              {message ?? "The update installer is starting. If Windows asks for administrator permission, choose Yes."}
            </div>
          ) : null}

          {uiPhase === "error" ? (
            <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message ?? checkResult.state?.error ?? "Update failed."}</span>
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs leading-relaxed text-zinc-400">
            If Windows shows a security or administrator prompt, choose <strong className="text-zinc-200">Yes</strong> or{" "}
            <strong className="text-zinc-200">Run anyway</strong>. Tournament data in your data folder is never modified during updates.
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          {canDismiss && uiPhase !== "installing" ? (
            <button
              type="button"
              onClick={() => void dismiss()}
              disabled={busy}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Later
            </button>
          ) : null}

          {uiPhase === "prompt" || uiPhase === "error" ? (
            <button
              type="button"
              onClick={() => void startDownload()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Update Now
            </button>
          ) : null}

          {uiPhase === "ready" ? (
            <button
              type="button"
              onClick={() => void applyUpdate()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Install Update
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
