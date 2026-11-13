"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import type { AdminPaymentRow, PaymentMethod, PaymentProvider, PaymentRecordStatus } from "@mysupplier/shared";
import { api, errorMessage, openDownload, paymentProofPath } from "@/lib/api";
import { useAsync, useDebounce, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDate, formatDateTime, formatNumber, formatSar } from "@/lib/format";
import { PaymentRecordBadge } from "@/components/OrderPayments";
import { Alert, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, StatTile, Table, Textarea, type Column } from "@/components/ui";

const STATUSES: PaymentRecordStatus[] = ["INITIATED", "AUTHORIZED", "CAPTURED", "SUBMITTED", "PAID", "FAILED", "REFUNDED"];
const PROVIDERS: PaymentProvider[] = ["MOYASAR", "MANUAL"];
const METHODS: PaymentMethod[] = ["CARD", "BANK_TRANSFER", "COD", "CREDIT"];
const METHOD_KEY: Record<PaymentMethod, TranslationKey> = { COD: "checkout.cod", BANK_TRANSFER: "checkout.bank", CARD: "checkout.card", CREDIT: "orders.creditNet" };
const STATUS_KEY: Record<PaymentRecordStatus, TranslationKey> = { INITIATED: "pay.status.INITIATED", AUTHORIZED: "pay.status.AUTHORIZED", CAPTURED: "pay.status.CAPTURED", SUBMITTED: "pay.status.SUBMITTED", PAID: "pay.status.PAID", FAILED: "pay.status.FAILED", REFUNDED: "pay.status.REFUNDED" };

const oneOf = <T extends string>(list: readonly T[], v: string | null): T | "" => (v && (list as readonly string[]).includes(v) ? (v as T) : "");

/**
 * Admin payments ledger: every gateway and manual record with filters (status, provider, method, dates, search),
 * finance tiles, bank-transfer proof confirmation, Moyasar reconciliation and full/partial refunds.
 */
function AdminPaymentsInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [status, setStatus] = useState<PaymentRecordStatus | "">(() => oneOf(STATUSES, params.get("status")));
  const [provider, setProvider] = useState<PaymentProvider | "">(() => oneOf(PROVIDERS, params.get("provider")));
  const [method, setMethod] = useState<PaymentMethod | "">(() => oneOf(METHODS, params.get("method")));
  const [from, setFrom] = useState(() => params.get("from") ?? "");
  const [to, setTo] = useState(() => params.get("to") ?? "");
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const debouncedQ = useDebounce(q, 350);
  const [page, setPage] = useState(1);
  const state = useAsync(
    () => api.adminPayments({ status, provider, method, q: debouncedQ.trim(), from: from || undefined, to: to ? `${to}T23:59:59.999Z` : undefined, page }),
    [status, provider, method, debouncedQ, from, to, page],
  );
  const [flash, setFlash] = useFlash(8000);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [refundTarget, setRefundTarget] = useState<AdminPaymentRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  const openRefund = (row: AdminPaymentRow) => {
    setRefundTarget(row);
    setRefundAmount(String(Math.round(row.amount * 100) / 100));
    setRefundReason("");
  };

  const submitRefund = async () => {
    if (!refundTarget) return;
    const value = Number(refundAmount);
    if (!Number.isFinite(value) || value <= 0 || value > refundTarget.amount + 0.005) {
      setFlash({ kind: "error", message: `Enter an amount between SAR 0.01 and ${formatSar(refundTarget.amount, lang)}.` });
      return;
    }
    if (refundReason.trim().length < 3) {
      setFlash({ kind: "error", message: "Give a short reason for the refund; it is recorded in the audit log." });
      return;
    }
    setRefunding(true);
    try {
      const result = await api.refund(refundTarget.orderId, {
        amount: Math.abs(value - refundTarget.amount) < 0.005 ? undefined : Math.round(value * 100) / 100,
        reason: refundReason.trim(),
      });
      setFlash({ kind: "success", message: `Refunded ${formatSar(result.refundedAmount, lang)} on ${refundTarget.order.reference}. The buyer has been notified.` });
      setRefundTarget(null);
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err, "Refund failed") });
    } finally {
      setRefunding(false);
    }
  };

  const reconcile = async (row: AdminPaymentRow) => {
    setBusyId(row.id);
    try {
      const result = await api.adminReconcilePayment(row.id);
      const outcome = result.outcomes.map((o) => `${o.outcome}${o.status ? ` → ${t(STATUS_KEY[o.status])}` : ""}`).join(", ");
      setFlash({ kind: "success", message: `${t("pay.admin.reconciled")}: ${outcome || "no gateway payment found"}.` });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err, "Reconciliation failed") });
    } finally {
      setBusyId(null);
    }
  };

  const confirmTransfer = async (row: AdminPaymentRow) => {
    if (!window.confirm(`${t("pay.confirmPayment")} · ${row.order.reference} · ${formatSar(row.amount, lang)}?`)) return;
    setBusyId(row.id);
    try {
      await api.updateOrderPayment(row.orderId, "PAID");
      setFlash({ kind: "success", message: t("pay.admin.confirmed") });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err, "Could not confirm the payment") });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminPaymentRow>[] = [
    { key: "date", header: t("common.date"), render: (p) => <span className="whitespace-nowrap text-slate-500">{formatDateTime(p.createdAt, lang)}</span> },
    { key: "order", header: t("returns.order"), render: (p) => <Link href={`/admin/orders/${p.order.id}`} className="font-medium text-brand-700 hover:underline">{p.order.reference}</Link> },
    {
      key: "buyer",
      header: t("reviews.buyer"),
      render: (p) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{p.order.buyer?.name ?? "—"}</div>
          <div className="truncate text-xs text-slate-500" dir="ltr">{p.order.buyer?.email ?? ""}</div>
        </div>
      ),
    },
    { key: "supplier", header: t("product.supplier"), render: (p) => p.order.company ? <Link href={`/admin/companies/${p.order.company.id}`} className="text-slate-700 hover:text-brand-700">{p.order.company.name}</Link> : "—" },
    {
      key: "method",
      header: t("orders.method"),
      render: (p) => {
        const m = p.method ?? p.order.paymentMethod;
        return (
          <div className="min-w-0">
            <div className="text-slate-700">{m ? t(METHOD_KEY[m]) : "—"}<span className="ms-1 text-xs text-slate-400">· {p.provider === "MOYASAR" ? "Moyasar" : "Manual"}</span></div>
            {p.providerPaymentId && <div className="max-w-[12rem] truncate font-mono text-xs text-slate-500" dir="ltr" title={p.providerPaymentId}>{p.providerPaymentId}</div>}
            {p.reference && <div className="font-mono text-xs text-slate-500" dir="ltr">{t("pay.admin.transferRef")} {p.reference}{p.paidAt ? ` · ${formatDate(p.paidAt, lang)}` : ""}</div>}
            {p.hasProof && <button type="button" onClick={() => void openDownload(paymentProofPath(p.orderId, p.id))} className="text-xs font-medium text-brand-700 hover:underline">{t("pay.viewReceipt")} ↗</button>}
          </div>
        );
      },
    },
    {
      key: "amount",
      header: t("orders.amount"),
      align: "end",
      render: (p) => <span className={`font-semibold tabular-nums ${p.amount < 0 ? "text-red-600" : "text-slate-900"}`} dir="ltr">{p.amount < 0 ? `−${formatSar(Math.abs(p.amount), lang)}` : formatSar(p.amount, lang)}</span>,
    },
    { key: "status", header: t("common.status"), render: (p) => <PaymentRecordBadge status={p.status} /> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (p) => (
        <div className="flex flex-wrap justify-end gap-2">
          {p.status === "SUBMITTED" && p.order.paymentStatus === "UNPAID" && (
            <Button size="sm" onClick={() => confirmTransfer(p)} loading={busyId === p.id}>{t("pay.confirmPayment")}</Button>
          )}
          {p.provider === "MOYASAR" && p.amount > 0 && (p.status === "INITIATED" || p.status === "AUTHORIZED" || p.status === "FAILED" || p.status === "PAID") && (
            <Button size="sm" variant="outline" onClick={() => reconcile(p)} loading={busyId === p.id}>{t("pay.admin.reconcile")}</Button>
          )}
          {p.status === "PAID" && p.amount > 0 && p.order.paymentStatus === "PAID" && (
            <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => openRefund(p)}>Refund</Button>
          )}
        </div>
      ),
    },
  ];

  const rows = state.data?.data ?? [];
  const totals = state.data?.totals;
  const outstanding = state.data?.outstanding ?? { count: 0, amount: 0 };
  const filtered = !!(status || provider || method || from || to || debouncedQ.trim());
  const clear = () => { setStatus(""); setProvider(""); setMethod(""); setFrom(""); setTo(""); setQ(""); setPage(1); };

  return (
    <div>
      <PageHeader title={t("admin.payments")} subtitle={t("pay.admin.subtitle")} />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Select name="status" value={status} onChange={(e) => { setStatus(e.target.value as PaymentRecordStatus | ""); setPage(1); }} placeholder={t("pay.admin.allStatuses")} options={STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) }))} />
          <Select name="provider" value={provider} onChange={(e) => { setProvider(e.target.value as PaymentProvider | ""); setPage(1); }} placeholder={t("pay.admin.allProviders")} options={[{ value: "MOYASAR", label: "Moyasar" }, { value: "MANUAL", label: "Manual" }]} />
          <Select name="method" value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod | ""); setPage(1); }} placeholder={t("pay.admin.allMethods")} options={METHODS.map((m) => ({ value: m, label: t(METHOD_KEY[m]) }))} />
          <Input name="from" type="date" aria-label={t("pay.admin.from")} value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} dir="ltr" />
          <Input name="to" type="date" aria-label={t("pay.admin.to")} value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} dir="ltr" />
          <Input name="q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Order ref, gateway id, transfer ref or buyer" dir="ltr" />
        </div>
      </Card>
      <FlashMessage flash={flash} className="mb-4" />

      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatTile label={t("pay.admin.collectedToday")} value={formatSar(totals.collectedToday.amount, lang)} sub={`${formatNumber(totals.collectedToday.count, lang)} ${t("pay.admin.records")}`} tone="brand" />
          <StatTile label={t("pay.admin.collectedMonth")} value={formatSar(totals.collectedMonth.amount, lang)} sub={`${formatNumber(totals.collectedMonth.count, lang)} ${t("pay.admin.records")}`} />
          <StatTile label={t("pay.admin.pendingTransfers")} value={formatSar(totals.pendingBankTransfers.amount, lang)} sub={`${formatNumber(totals.pendingBankTransfers.count, lang)} ${t("pay.admin.records")}`} tone={totals.pendingBankTransfers.count > 0 ? "amber" : "default"} />
          <StatTile label={t("pay.admin.refundedMonth")} value={formatSar(totals.refundedMonth.amount, lang)} sub={`${formatNumber(totals.refundedMonth.count, lang)} ${t("pay.admin.records")}`} />
          <StatTile label={t("pay.admin.outstanding")} value={formatSar(outstanding.amount, lang)} sub={`${formatNumber(outstanding.count, lang)} ${t("pay.admin.unpaidOrders")}`} tone={outstanding.count > 0 ? "amber" : "default"} />
        </div>
      )}

      {state.loading && !state.data ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          {state.loading && <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Refreshing…</div>}
          <Table
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            empty={
              <EmptyState
                title={filtered ? "No matching payments" : "No payments yet"}
                description={filtered ? "Try clearing the status, provider, method, date or search filters." : "Payment records appear here as soon as buyers pay by card, submit a transfer proof or a manual payment is recorded."}
                action={filtered ? <Button variant="outline" onClick={clear}>{t("shop.clearFilters")}</Button> : undefined}
              />
            }
          />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}

      <Modal
        open={!!refundTarget}
        title={refundTarget ? `Refund ${refundTarget.order.reference}` : "Refund"}
        onClose={() => (refunding ? undefined : setRefundTarget(null))}
        footer={
          <>
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={refunding}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={submitRefund} loading={refunding}>Refund {formatSar(Number(refundAmount) || 0, lang)}</Button>
          </>
        }
      >
        {refundTarget && (
          <div className="space-y-4">
            <dl className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{t("reviews.buyer")}</dt><dd className="font-medium text-slate-900">{refundTarget.order.buyer?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t("product.supplier")}</dt><dd className="font-medium text-slate-900">{refundTarget.order.company?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t("orders.method")}</dt><dd className="font-medium text-slate-900">{refundTarget.provider === "MOYASAR" ? "Moyasar" : "Manual"}{refundTarget.order.paymentMethod ? ` · ${t(METHOD_KEY[refundTarget.order.paymentMethod])}` : ""}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t("orders.amount")}</dt><dd className="font-semibold tabular-nums text-brand-700">{formatSar(refundTarget.amount, lang)}</dd></div>
            </dl>
            <Input
              label="Refund amount (SAR)"
              name="refundAmount"
              type="number"
              min={0.01}
              max={refundTarget.amount}
              step="0.01"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              dir="ltr"
              hint="Defaults to the full payment. Enter a smaller amount for a partial refund."
              required
            />
            <Textarea label="Reason" name="refundReason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Damaged goods on delivery, agreed with supplier." hint="Shown to the buyer and stored in the audit log." required />
            {refundTarget.provider === "MOYASAR" ? (
              <p className="text-xs text-slate-500">The refund is sent to Moyasar and returned to the buyer&apos;s card within a few business days.</p>
            ) : (
              <p className="text-xs text-amber-800">This is a manual payment: the record is marked refunded, but you must transfer the money back to the buyer yourself.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AdminPaymentsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminPaymentsInner />
    </Suspense>
  );
}
