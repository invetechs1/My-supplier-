"use client";
import React, { useEffect } from "react";

import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { installClientErrorReporting } from "@/lib/errors";
import { I18nProvider } from "@/lib/i18n";
import { installAnalytics, track } from "@/lib/analytics";
import { usePathname } from "next/navigation";

/** Reports uncaught errors and unhandled promise rejections to POST /client-errors (throttled, never throws). */
function ClientErrorReporter() {
  useEffect(() => installClientErrorReporting(), []);
  return null;
}

/** Consent-gated page views (one per route change) and beacon flushing on tab hide. */
function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => installAnalytics(), []);
  useEffect(() => { if (pathname) track("page_view"); }, [pathname]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <CartProvider>
          <ClientErrorReporter />
          <AnalyticsTracker />
          {children}
        </CartProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
