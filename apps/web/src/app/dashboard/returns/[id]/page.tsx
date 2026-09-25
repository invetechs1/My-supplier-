"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { ReturnStatus } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { RETURN_FLOW, commerceApi, returnReasonLabel } from "@/lib/api/commerce";
import { useAsync, useFlash, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatSar } from "@/lib/format";
import { ReturnStatusBadge } from "@/components/Orders";
import { Alert, Button, Card, CardBody, CardHeader, FlashMessage, LinkButton, LoadingBlock, PageHeader } from "@/components/ui";

const STEP_HINT: Record<ReturnStatus, string> = {
  REQUESTED: "Waiting for the supplier to review your request.",
  APPROVED: "Approved. Send the goods back to the supplier; they will confirm receipt.",
  RECEIVED: "The supplier received the goods. The refund is being processed.",
  REFUNDED: "Refund issued.",
  REJECTED: "The supplier rejected this request.",
  CANCELLED: "You cancelled this request.",
};

function ReturnTimeline({ status }: { status: ReturnStatus }) {
  const terminal = status === "REJECTED" || status === "CANCELLED";
  const idx = RETURN_FLOW.indexOf(status);
  // A rejected/cancelled return stopped after REQUESTED (or APPROVED); show the branch as the last step.
  const steps: ReturnStatus[] = terminal ? ["REQUESTED", status] : RETURN_FLOW;
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = terminal ? true : i <= idx;
        const current = s === status;
        const danger = terminal && s === status;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-2",
                  danger ? "bg-red-600 text-white ring-red-600" : done ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-400 ring-slate-200",
                  current && !danger && "ring-amber-500",
                )}
              >
                {done && !current ? "✓" : danger ? "×" : i + 1}
              </span>
              <span className={cn("mt-1 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide", danger ? "text-red-700" : done ? "text-brand-700" : "text-slate-400")}>{s}</span>
            </div>
            {i < steps.length - 1 && <span className={cn("mb-4 h-0.5 flex-1 rounded", !terminal && i < idx ? "bg-brand-600" : "bg-slate-200")} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useI18n();
  const state = useAsync(() => commerceApi.returnDetail(id), [id]);
  const [flash, setFlash] = useFlash();
  const [cancelling, setCancelling] = useState(false);
  usePageTitle(state.data ? `Return ${state.data.reference}` : "Return");

  const cancel = async () => {
    if (!window.confirm("Cancel this return request?")) return;
    setCancelling(true);
    try {
      const updated = await commerceApi.cancelReturn(id);
      state.setData((prev) => (prev ? { ...prev, ...updated } : prev));
      setFlash({ kind: "success", message: "Return request cancelled." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setCancelling(false);
    }
  };

  if (state.loading) return <LoadingBlock />;
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? "Return not found"}</Alert>;
  const r = state.data;
  const goodsValue = r.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const refundShown = typeof r.refundAmount === "number" ? r.refundAmount : r.estimatedRefund;

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/dashboard/returns" className="hover:text-brand-700">Returns</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{r.reference}</span>
      </nav>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {r.reference}
            <ReturnStatusBadge status={r.status} />
          </span>
        }
        subtitle={
          <>
            Order{" "}
            <Link href={`/dashboard/orders/${r.orderId}`} className="font-semibold text-brand-700 hover:underline">{r.order?.reference ?? r.orderId}</Link>
            {r.company ? ` · ${r.company.name}` : ""} · requested {formatDateTime(r.createdAt, lang)}
          </>
        }
        action={
          <>
            <LinkButton href={`/dashboard/orders/${r.orderId}`} variant="outline">View order</LinkButton>
            {r.status === "REQUESTED" && (
              <Button variant="danger" onClick={cancel} loading={cancelling}>Cancel request</Button>
            )}
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />

      <Card className="p-5">
        <ReturnTimeline status={r.status} />
        <p className="mt-4 text-sm text-slate-600">{STEP_HINT[r.status]}</p>
        {r.resolution && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-semibold">Supplier note:</span> {r.resolution}
          </p>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Items to return" subtitle={`${r.items.length} ${r.items.length === 1 ? "line" : "lines"}`} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">Item</th>
                  <th className="px-4 py-3 text-start">Unit</th>
                  <th className="px-4 py-3 text-end">Qty</th>
                  <th className="px-4 py-3 text-end">Unit price</th>
                  <th className="px-4 py-3 text-end">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.items.map((it) => (
                  <tr key={it.orderItemId}>
                    <td className="px-4 py-3 font-medium text-slate-900">{it.name}</td>
                    <td className="px-4 py-3 text-slate-600">{it.unit}</td>
                    <td className="px-4 py-3 text-end tabular-nums">{it.quantity}</td>
                    <td className="px-4 py-3 text-end tabular-nums">{formatSar(it.unitPrice, lang)}</td>
                    <td className="px-4 py-3 text-end font-medium tabular-nums">{formatSar(it.unitPrice * it.quantity, lang)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-end text-slate-600">Goods value (excl. VAT)</td>
                  <td className="px-4 py-2 text-end tabular-nums text-slate-900">{formatSar(goodsValue, lang)}</td>
                </tr>
                <tr className="border-t border-slate-200">
                  <td colSpan={4} className="px-4 py-3 text-end font-semibold text-slate-700">{typeof r.refundAmount === "number" ? "Refund amount" : "Estimated refund (incl. VAT)"}</td>
                  <td className="px-4 py-3 text-end text-base font-bold tabular-nums text-brand-700">{formatSar(refundShown, lang)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Request" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div><dt className="text-slate-500">Reason</dt><dd className="font-medium text-slate-900">{returnReasonLabel(r.reason)}</dd></div>
              {r.details && <div><dt className="text-slate-500">Details</dt><dd className="whitespace-pre-line font-medium text-slate-900">{r.details}</dd></div>}
              <div><dt className="text-slate-500">Supplier</dt><dd className="font-medium text-slate-900">{r.company ? <Link href={`/suppliers/${r.company.id}`} className="hover:text-brand-700">{r.company.name}</Link> : "—"}</dd></div>
              <div><dt className="text-slate-500">Last update</dt><dd className="font-medium text-slate-900">{formatDateTime(r.updatedAt, lang)}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Refund" />
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Estimated</span><span className="tabular-nums text-slate-900">{formatSar(r.estimatedRefund, lang)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Actual</span><span className="font-semibold tabular-nums text-slate-900">{typeof r.refundAmount === "number" ? formatSar(r.refundAmount, lang) : "—"}</span></div>
              {r.order && (
                <p className="pt-1 text-xs text-slate-500">
                  Order paid by {r.order.paymentMethod?.replace(/_/g, " ").toLowerCase() ?? "—"} · payment {r.order.paymentStatus.toLowerCase()}. Refunds are returned the same way; unpaid credit invoices are reduced instead.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
