"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "./ui";

export const CONSENT_KEY = "ms_consent";

/** Cookie / local-storage consent banner. Stores the visitor's choice in localStorage. */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch {
      /* storage unavailable: don't nag */
    }
  }, []);

  const choose = (value: "accepted" | "essential") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ value, at: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6" role="dialog" aria-live="polite" aria-label="Cookie consent" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-slate-600">
          We use essential browser storage to keep you signed in, remember your language and save your cart. With your consent we also use anonymous analytics to improve the marketplace. See our{" "}
          <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => choose("essential")}>Essential only</Button>
          <Button size="sm" onClick={() => choose("accepted")}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
