import React, { useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  Monitor,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { isCloudHostedApp, localApi } from "../config/api";
import {
  buildPurchaseUrl,
  buildRegisterUrl,
  clearAuthSession,
  fetchTrialEligibility,
  getStoredAuthUser,
  loginPokerClup,
  type PokerClupUser,
  type TrialEligibility,
} from "../license/pokerclupApi";
import {
  claimPaidLicenseForMachine,
  provisionTrialForMachine,
} from "../license/licenseClient";

type MachineInfo = {
  machineId: string;
  machineName: string | null;
};

type LicenseOnboardingProps = {
  onLicensed: () => void;
};

export default function LicenseOnboarding({ onLicensed }: LicenseOnboardingProps) {
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [eligibility, setEligibility] = useState<TrialEligibility | null>(null);
  const [user, setUser] = useState<PokerClupUser | null>(getStoredAuthUser());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCloudApp = isCloudHostedApp();

  const loadMachine = async () => {
    if (isCloudApp) {
      const { getOrCreateBrowserMachine } = await import("../license/browserLicense");
      const record = getOrCreateBrowserMachine();
      return {
        machineId: record.machineId,
        machineName: record.machineName,
      };
    }

    const response = await fetch(localApi("/api/license/machine"));
    if (!response.ok) {
      throw new Error("Local server is not running. Install and start start.bat on port 3000 first.");
    }

    return (await response.json()) as MachineInfo;
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const machineInfo = await loadMachine();
        if (cancelled) return;

        setMachine(machineInfo);
        const trialStatus = await fetchTrialEligibility(machineInfo.machineId);
        if (cancelled) return;

        setEligibility(trialStatus);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Setup check failed.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCloudApp]);

  const handleLogin = async () => {
    setBusy("login");
    setError(null);

    try {
      const loggedInUser = await loginPokerClup(email.trim(), password);
      setUser(loggedInUser);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleTrial = async () => {
    setBusy("trial");
    setError(null);

    try {
      await provisionTrialForMachine();
      window.dispatchEvent(new Event("license-updated"));
      onLicensed();
    } catch (trialError) {
      setError(trialError instanceof Error ? trialError.message : "Trial activation failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleClaim = async () => {
    setBusy("claim");
    setError(null);

    try {
      await claimPaidLicenseForMachine();
      window.dispatchEvent(new Event("license-updated"));
      onLicensed();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Could not sync license.");
    } finally {
      setBusy(null);
    }
  };

  const openPurchase = (planId: "short" | "annual") => {
    if (!machine) return;
    window.open(buildPurchaseUrl(planId, machine.machineId), "_blank", "noopener,noreferrer");
  };

  const handleLogout = () => {
    clearAuthSession();
    setUser(null);
    setPassword("");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking installation and license options...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <Monitor className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-200">
              Step 1 · Installation detected
            </h2>
            {machine ? (
              <>
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                  This tournament computer is registered as{" "}
                  <strong className="text-zinc-200">{machine.machineName || "Salon PC"}</strong>.
                </p>
                <p className="text-[11px] text-zinc-600 font-mono mt-2 break-all">{machine.machineId}</p>
                {eligibility && (
                  <p className={`text-xs mt-3 ${eligibility.trialEligible ? "text-emerald-400" : "text-amber-400"}`}>
                    {eligibility.message}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-red-300 mt-2">{error}</p>
            )}
          </div>
        </div>
      </div>

      {!user ? (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-200">
              Step 2 · Sign in to PokerClup
            </h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Use the account you created at pokerclup.com. Trial and paid licenses are delivered to this computer after you choose a plan.
          </p>
          <div className="grid gap-3">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100"
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={busy === "login" || !email || !password}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black rounded-xl text-xs font-black uppercase tracking-wider"
            >
              {busy === "login" ? "Signing in..." : "Sign in"}
            </button>
            <a
              href={buildRegisterUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-300"
            >
              Create account
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-300 text-sm">
              <ShieldCheck className="w-4 h-4" />
              Signed in as <strong>{user.email}</strong>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
            >
              Sign out
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col">
              <Sparkles className="w-5 h-5 text-amber-400 mb-3" />
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">3-Day Trial</h3>
              <p className="text-xs text-zinc-400 mt-2 flex-1">
                One free trial per tournament PC. Full features for 3 days.
              </p>
              <button
                type="button"
                onClick={() => void handleTrial()}
                disabled={!machine || !eligibility?.trialEligible || busy === "trial"}
                className="mt-4 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl text-xs font-black uppercase tracking-wider"
              >
                {busy === "trial" ? "Activating..." : eligibility?.trialEligible ? "Start free trial" : "Trial used on this PC"}
              </button>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col">
              <ShoppingCart className="w-5 h-5 text-blue-400 mb-3" />
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">30-Day License</h3>
              <p className="text-xs text-zinc-400 mt-2 flex-1">
                Purchase on pokerclup.com. After admin approval, sync the license to this PC.
              </p>
              <button
                type="button"
                onClick={() => openPurchase("short")}
                disabled={!machine}
                className="mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider"
              >
                Buy 30 days
              </button>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col">
              <ShoppingCart className="w-5 h-5 text-emerald-400 mb-3" />
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">Annual License</h3>
              <p className="text-xs text-zinc-400 mt-2 flex-1">
                Best value for poker rooms running regular tournaments all year.
              </p>
              <button
                type="button"
                onClick={() => openPurchase("annual")}
                disabled={!machine}
                className="mt-4 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider"
              >
                Buy 1 year
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">
              Already purchased?
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              After payment is approved, click below to write the license directly to this tournament PC and your email.
            </p>
            <button
              type="button"
              onClick={() => void handleClaim()}
              disabled={!machine || busy === "claim"}
              className="px-5 py-2.5 bg-zinc-100 hover:bg-white disabled:opacity-60 text-black rounded-xl text-xs font-black uppercase tracking-wider"
            >
              {busy === "claim" ? "Syncing..." : "Sync my paid license"}
            </button>
          </div>
        </>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {isCloudApp && (
        <p className="text-xs text-zinc-500 leading-relaxed">
          For full tournament management and QR Live Tracking, run the Tournament Master local server on port 3000 on your salon PC.
        </p>
      )}
    </div>
  );
}
