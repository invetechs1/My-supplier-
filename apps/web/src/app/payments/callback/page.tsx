"use client";
import React from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { OrderExtended, PaymentRecord } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { safeNext, useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { Badge, Card, LinkButton, LoadingBlock, Spinner } from "@/components/ui";

type State =
  | { kind: "verifying" }
  | { kind: "success"; order: OrderExtended; payment: PaymentRecord }
  | { kind: "failed"; message: string };

function CallbackInner() {
  const { lang } = useI18n();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const paymentId = params.get("id");
  const status = params.get("status");
  const orderId = params.get("order");
  const gatewayMessage = params.get("message");
  const [state, setState] = useState<State>({ kind: "verifying" });
  usePageTitle("Payment result");

  useEffect(() => {
    if (authLoading) return;
    if (!orderId || !paymentId) {
      setState({ kind: "failed", message: "This payment link is incomplete. Open your order and try again." });
      return;
    }
    if (!user) return; // login redirect below
    let active = true;
    api
      .verifyPayment(orderId, paymentId)
      .then((res) => {
        if (!active) return;
        if (res.payment?.status === "PAID" || res.order?.paymentStatus === "PAID") setState({ kind: "success", order: res.order, payment: res.payment });
        else setState({ kind: "failed", message: gatewayMessage || `The payment was not completed (status: ${res.payment?.status ?? status ?? "unknown"}).` });
      })
      .catch((err) => {
        if (active) setState({ kind: "failed", message: errorMessage(err, gatewayMessage || "The payment could not be verified.") });
      });
    return () => {
      active = false;
    };
  }, [authLoading, user, orderId, paymentId, status, gatewayMessage]);

  const orderHref = orderId ? `/dashboard/orders/${orderId}` : "/dashboard/orders";
  const payHref = orderId ? `/pay/${orderId}` : "/dashboard/orders";

  if (!authLoading && !user && orderId && paymentId) {
    const next = `/payments/callback?id=${encodeURIComponent(paymentId)}&status=${encodeURIComponent(status ?? "")}&order=${encodeURIComponent(orderId)}`;
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 text-center">
        <Card className="p-8">
          <h1 className="text-xl font-semibold text-slate-900">Sign in to confirm your payment</h1>
          <p className="mt-2 text-sm text-slate-500">Your session expired during the payment. Sign in and we will verify it with the gateway.</p>
          <LinkButton href={`/login?next=${encodeURIComponent(safeNext(next) ?? "/payments/callback")}`} className="mt-6">Sign in</LinkButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
      <Card className="p-8 text-center">
        {state.kind === "verifying" && (
          <>
            <Spinner size="lg" className="mx-auto" />
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Verifying your payment…</h1>
            <p className="mt-2 text-sm text-slate-500">Please keep this page open. We are confirming the transaction with Moyasar.</p>
          </>
        )}
        {state.kind === "success" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Payment successful</h1>
            <p className="mt-1 text-sm text-slate-500">Thank you. The supplier has been notified and your VAT invoice is ready.</p>
            <dl className="mx-auto mt-6 max-w-xs space-y-2 text-start text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Order</dt><dd className="font-semibold text-slate-900">{state.order.reference}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Amount</dt><dd className="font-semibold tabular-nums text-slate-900">{formatSar(state.payment?.amount ?? state.order.total, lang)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd><Badge tone="green">Paid</Badge></dd></div>
              {state.payment?.providerPaymentId && (
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Transaction</dt><dd className="truncate font-mono text-xs text-slate-700" dir="ltr">{state.payment.providerPaymentId}</dd></div>
              )}
            </dl>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LinkButton href={`/dashboard/orders/${state.order.id}`}>View order</LinkButton>
              <LinkButton href="/dashboard/orders" variant="outline">All my orders</LinkButton>
            </div>
          </>
        )}
        {state.kind === "failed" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Payment not completed</h1>
            <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            <p className="mt-1 text-xs text-slate-500">No money has been taken if the payment failed. You can retry from the order page or choose another payment method.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LinkButton href={payHref}>Try again</LinkButton>
              <LinkButton href={orderHref} variant="outline">Open order</LinkButton>
            </div>
            <p className="mt-6 text-xs text-slate-400">
              Need help? <Link href="/contact" className="underline hover:text-slate-600">Contact support</Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CallbackInner />
    </Suspense>
  );
}
