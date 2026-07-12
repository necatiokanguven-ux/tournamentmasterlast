import React from "react";
import { KeyRound } from "lucide-react";
import LicenseSettings from "./LicenseSettings";

export default function LicenseView() {
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <KeyRound className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wide text-zinc-100">
              License Key
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Activate your Tournament Master license on this computer.
            </p>
          </div>
        </div>
      </div>

      <LicenseSettings variant="page" />

      <div className="mt-8 bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4">
          How to get your license key
        </h2>
        <ol className="space-y-3 text-sm text-zinc-300 leading-relaxed list-decimal list-inside">
          <li>Sign in at <strong className="text-zinc-100">pokerclup.com</strong></li>
          <li>Open <strong className="text-zinc-100">My Licenses</strong> from the menu</li>
          <li>Copy your <strong className="text-zinc-100">TRIAL-</strong>, <strong className="text-zinc-100">SHORT-</strong>, or <strong className="text-zinc-100">FULL-</strong> key</li>
          <li>Paste it above and click <strong className="text-zinc-100">Activate License</strong></li>
        </ol>
        <p className="text-xs text-zinc-500 mt-4">
          Each license works on one tournament PC. QR Live Tracking requires the local server on port 3000.
        </p>
      </div>
    </div>
  );
}
