import React, { useState } from "react";
import { KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { activateLicenseKey } from "../license/licenseClient";

type ExistingLicenseActivationProps = {
  onActivated?: () => void;
  variant?: "prominent" | "compact";
};

export default function ExistingLicenseActivation({
  onActivated,
  variant = "prominent",
}: ExistingLicenseActivationProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleActivate = async () => {
    const trimmed = licenseKey.trim();
    if (!trimmed) {
      setError("Please enter your license key.");
      return;
    }

    setActivating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await activateLicenseKey(trimmed);

      if (!result.valid) {
        setError(result.message || "This license is not valid on this computer.");
        return;
      }

      setSuccessMessage(result.message || "License activated successfully.");
      window.dispatchEvent(new Event("license-updated"));
      onActivated?.();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "License activation failed.");
    } finally {
      setActivating(false);
    }
  };

  const containerClass =
    variant === "prominent"
      ? "bg-gradient-to-br from-amber-500/10 to-zinc-900/60 border border-amber-500/30 rounded-2xl p-6"
      : "bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6";

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-3 mb-4">
        <KeyRound className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">
            Already have a license key?
          </h2>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            Enter the license key you received by email or from pokerclup.com. No sign-in required.
            If the key is valid and not expired, the full tournament menu unlocks on this PC.
          </p>
        </div>
      </div>

      <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-2">
        License Key
      </label>
      <input
        type="text"
        value={licenseKey}
        onChange={(event) => {
          setLicenseKey(event.target.value);
          setError(null);
          setSuccessMessage(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void handleActivate();
          }
        }}
        placeholder="TRIAL-XXXXX-XXXXX-XXXXX-XXXXX"
        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono text-zinc-100 focus:border-amber-500 outline-none"
        autoComplete="off"
        spellCheck={false}
      />

      {error && (
        <div className="mt-3 flex items-start gap-2 text-red-400 text-sm">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mt-3 flex items-start gap-2 text-emerald-400 text-sm">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleActivate()}
        disabled={activating || !licenseKey.trim()}
        className="mt-4 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-2"
      >
        {activating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Verifying license...
          </>
        ) : (
          "Activate existing license"
        )}
      </button>
    </div>
  );
}
