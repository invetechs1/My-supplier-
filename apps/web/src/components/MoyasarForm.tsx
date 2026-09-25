"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PaymentIntent } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { Alert, Spinner } from "./ui";

export const MOYASAR_SCRIPT = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
export const MOYASAR_CSS = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";

/** Injects the Moyasar stylesheet once. */
function useMoyasarStyles() {
  useEffect(() => {
    if (document.querySelector(`link[href="${MOYASAR_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MOYASAR_CSS;
    document.head.appendChild(link);
  }, []);
}

export interface MoyasarFormProps {
  orderId: string;
  intent: PaymentIntent;
  /** Called after the payment is created and verified with the API (the form then redirects to `intent.callbackUrl`). */
  onCompleted?: (paymentId: string) => void;
  className?: string;
}

/**
 * Renders the Moyasar hosted payment form (Mada / Visa / Mastercard / Apple Pay) for a payment intent.
 * Only one instance should be mounted at a time — Moyasar mounts into the `.mysr-form` element.
 */
export function MoyasarForm({ orderId, intent, onCompleted, className }: MoyasarFormProps) {
  const { t, lang } = useI18n();
  const [scriptReady, setScriptReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const initialised = useRef<string | null>(null);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  useMoyasarStyles();

  const init = useCallback(() => {
    if (initialised.current === intent.orderId) return;
    const moyasar = typeof window !== "undefined" ? window.Moyasar : undefined;
    if (!moyasar) {
      setInitError(t("checkout.moyasarLoadFailed"));
      return;
    }
    if (!intent.publishableKey) {
      setInitError(t("checkout.cardNotConfigured"));
      return;
    }
    initialised.current = intent.orderId;
    try {
      moyasar.init({
        element: ".mysr-form",
        amount: intent.amountHalalas,
        currency: intent.currency || "SAR",
        description: intent.description,
        publishable_api_key: intent.publishableKey,
        callback_url: intent.callbackUrl,
        metadata: { order_id: intent.orderId },
        methods: ["creditcard", "applepay"],
        on_completed: async (payment) => {
          setVerifying(true);
          setVerifyError(null);
          try {
            await api.verifyPayment(orderId, payment.id);
            onCompletedRef.current?.(payment.id);
          } catch (err) {
            // The callback page re-verifies, so a transient failure here is not fatal.
            setVerifyError(errorMessage(err, t("checkout.paymentNotConfirmed")));
          } finally {
            setVerifying(false);
          }
        },
      });
    } catch (err) {
      initialised.current = null;
      setInitError(errorMessage(err, t("checkout.paymentInitFailed")));
    }
  }, [intent, orderId, t]);

  useEffect(() => {
    if (scriptReady) init();
  }, [scriptReady, init]);

  return (
    <div className={className}>
      <Script src={MOYASAR_SCRIPT} strategy="afterInteractive" crossOrigin="anonymous" onReady={() => setScriptReady(true)} onError={() => setInitError(t("checkout.paymentScriptFailed"))} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div>
          <p className="font-medium text-slate-900">{intent.description}</p>
          <p className="text-xs text-slate-500">{t("checkout.reference")} {intent.reference} · {t("checkout.securedByMoyasar")}</p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-brand-700">{formatSar(intent.amount, lang)}</p>
      </div>
      {initError && <Alert className="mb-3">{initError}</Alert>}
      {verifyError && <Alert kind="warning" className="mb-3">{verifyError}</Alert>}
      {verifying && (
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
          <Spinner size="sm" /> {t("checkout.confirmingPayment")}
        </div>
      )}
      {!scriptReady && !initError && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Spinner size="sm" /> {t("checkout.loadingPaymentForm")}
        </div>
      )}
      <div className="mysr-form" dir="ltr" />
      <p className="mt-3 text-center text-xs text-slate-400">{t("checkout.cardFooter")}</p>
    </div>
  );
}
