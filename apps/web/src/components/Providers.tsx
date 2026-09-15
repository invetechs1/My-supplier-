"use client";
import React, { useEffect } from "react";

import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { installClientErrorReporting } from "@/lib/errors";
import { I18nProvider } from "@/lib/i18n";

/** Reports uncaught errors and unhandled promise rejections to POST /client-errors (throttled, never throws). */
function ClientErrorReporter() {
  useEffect(() => installClientErrorReporting(), []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <CartProvider>
          <ClientErrorReporter />
          {children}
        </CartProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
