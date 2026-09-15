"use client";
import React from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { usePaymentConfig } from "@/lib/payments";
import { formatSar } from "@/lib/format";
import { MoyasarForm } from "@/components/MoyasarForm";
import { PaymentStatusBadge } from "@/components/Orders";
import { Alert, Card, CardBody, CardHeader, LinkButton, LoadingBlock, PageHeader } from "@/components/ui";

export default function PayOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { lang } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const { config, loading: configLoading } = usePaymentConfig();
  usePageTitle("Pay order");

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=${encodeURIComponent(`/pay/${orderId}`)}`);
  }, [authLoading, user, router, orderId]);

  const order = useAsync(() => api.order(orderId), [orderId], !!user);
  const alreadyPaid = order.data?.paymentStatus === "PAID";
  const cancelled = order.data?.status === "CANCELLED";
  const cardEnabled = !!config?.cardPaymentsEnabled;
  const canPay = !!order.data && !alreadyPaid && !cancelled && cardEnabled;
  const intent = useAsync(() => api.createPaymentIntent(orderId), [orderId, canPay], canPay);

  if (authLoading || !user) return <LoadingBlock className="min-h-[60vh]" />;

  const orderHref = `/dashboard/orders/${orderId}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-3 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/dashboard/orders" className="hover:text-brand-700">Orders</Link>
        <span className="mx-2">/</span>
        <Link href={orderHref} className="hover:text-brand-700">{order.data?.reference ?? "Order"}</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">Pay</span>
      </nav>
      <PageHeader title="Pay by card" subtitle="Mada, Visa, Mastercard and Apple Pay — processed securely by Moyasar." />

      {order.loading || configLoading ? (
        <LoadingBlock />
      ) : order.error || !order.data ? (
        <Alert onRetry={order.reload}>{order.error ?? "Order not found"}</Alert>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={order.data.reference}
              subtitle={order.data.company?.name ?? order.data.companyId}
              action={
                <>
                  <PaymentStatusBadge status={order.data.paymentStatus} />
                  <span className="text-lg font-semibold tabular-nums text-brand-700">{formatSar(order.data.total, lang)}</span>
                </>
              }
            />
            <CardBody>
              {alreadyPaid ? (
                <Alert kind="success">This order is already paid. Thank you!</Alert>
              ) : cancelled ? (
                <Alert kind="warning">This order was cancelled and cannot be paid.</Alert>
              ) : !cardEnabled ? (
                <Alert kind="info">Card payments are coming soon. Please pay by bank transfer or cash on delivery as shown on the order page.</Alert>
              ) : intent.loading ? (
                <LoadingBlock label="Preparing secure payment…" className="py-8" />
              ) : intent.error || !intent.data ? (
                <Alert onRetry={intent.reload}>{intent.error ?? "Could not start the payment."}</Alert>
              ) : (
                <MoyasarForm orderId={orderId} intent={intent.data} />
              )}
            </CardBody>
          </Card>
          <div className="flex flex-wrap gap-3">
            <LinkButton href={orderHref} variant="outline">Back to order</LinkButton>
            <LinkButton href="/help" variant="ghost">Payment FAQ</LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
