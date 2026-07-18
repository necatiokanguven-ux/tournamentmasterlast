import React, { useState } from "react";

import { KeyRound } from "lucide-react";

import LicenseOnboarding from "./LicenseOnboarding";

import LicenseSettings from "./LicenseSettings";

import { useLicenseStatus } from "../license/useLicenseStatus";



export default function LicenseView() {

  const { isLicensed, loading, refresh } = useLicenseStatus();

  const [showManual, setShowManual] = useState(false);



  return (

    <div className="p-6 md:p-8 max-w-4xl mx-auto w-full">

      <div className="mb-8">

        <div className="flex items-center gap-3 mb-3">

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">

            <KeyRound className="w-5 h-5 text-amber-400" />

          </div>

          <div>

            <h1 className="text-2xl font-black uppercase tracking-wide text-zinc-100">

              License & Setup

            </h1>

            <p className="text-sm text-zinc-400 mt-1">

              Install first, then choose trial, 30-day, or annual license for this tournament PC.

            </p>

          </div>

        </div>

      </div>



      {!loading && !isLicensed && !showManual && (

        <LicenseOnboarding

          onLicensed={() => {

            void refresh();

          }}

        />

      )}



      {(showManual || isLicensed) && (

        <>

          <LicenseSettings variant="page" />

          {!isLicensed && (

            <button

              type="button"

              onClick={() => setShowManual(false)}

              className="mt-4 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"

            >

              Back to setup wizard

            </button>

          )}

        </>

      )}



      {!loading && !isLicensed && !showManual && (

        <button

          type="button"

          onClick={() => setShowManual(true)}

          className="mt-6 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"

        >

          Already have a license key? Enter manually

        </button>

      )}



      <div className="mt-8 bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">

        <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4">

          How licensing works

        </h2>

        <ol className="space-y-3 text-sm text-zinc-300 leading-relaxed list-decimal list-inside">

          <li>Create your account at <strong className="text-zinc-100">pokerclup.com</strong></li>

          <li>Install the local server package and open Tournament Master on the tournament PC</li>

          <li>Sign in here and choose <strong className="text-zinc-100">3-day trial</strong>, <strong className="text-zinc-100">30-day</strong>, or <strong className="text-zinc-100">annual</strong> license</li>

          <li>Each tournament PC gets <strong className="text-zinc-100">one trial</strong>. Paid licenses bind to this computer after approval.</li>

        </ol>

      </div>

    </div>

  );

}


