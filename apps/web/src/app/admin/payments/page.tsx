"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import type { AdminPaymentRow, PaymentProvider, PaymentRecordStatus } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useDebounce, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatNumber, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, StatTile, Table, Textarea, type Column } from "@/components/ui";

const STATUSES: PaymentRecordStatus[] = ["INITIATED", "PAID", "FAILED", "REFUNDED"];
const PROVIDERS: PaymentProvider[] = ["MOYASAR", "MANUAL"];

const STATUS_TONE: Record<PaymentRecordStatus, "green" | "slate" | "red" | "amber"> = {
  PAID: "green",
  REFUNDED: "slate",
  FAILED: "red",
  INITIATED: "amber",
};

const METHOD_LABEL: Record<string, string> = {
  COD: "Cash on delivery",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
};

function isStatus(v: string | null): v is PaymentRecordStatus {
  return !!v && (STATUSES as string[]).includes(v);
}
function isProvider(v: string | null): v is PaymentProvider {
  return !!v && (PROVIDERS as string[]).includes(v);
}

function AdminPaymentsInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [status, setStatus] = useState<PaymentRecordStatus | "">(() => (isStatus(params.get("status")) ? (params.get("status") as PaymentRecordStatus) : ""));
  const [provider, setProvider] = useState<PaymentProvider | "">(() => (isProvider(params.get("provider")) ? (params.get("provider") as PaymentProvider) : ""));
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const debouncedQ = useDebounce(q, 350);
  const [page, setPage] = useState(1);
  const state = useAsync(
    () => api.adminPayments({ status: status || undefined, provider: provider || undefined, q: debouncedQ.trim() || undefined, page }),
    [status, provider, debouncedQ, page],
  );
  const [flash, setFlash] = useFlash(8000);

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

  const columns: Column<AdminPaymentRow>[] = [
    { key: "date", header: "Date", render: (p) => <span className="whitespace-nowrap text-slate-500">{formatDateTime(p.createdAt, lang)}</span> },
    { key: "order", header: "Order", render: (p) => <Link href={`/admin/orders/${p.order.id}`} className="font-medium text-brand-700 hover:underline">{p.order.reference}</Link> },
    {
      key: "buyer",
      header: "Buyer",
      render: (p) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{p.order.buyer?.name ?? "—"}</div>
          <div className="truncate text-xs text-slate-500" dir="ltr">{p.order.buyer?.email ?? ""}</div>
        </div>
      ),
    },
    { key: "supplier", header: "Supplier", render: (p) => p.order.company ? <Link href={`/admin/companies/${p.order.company.id}`} className="text-slate-700 hover:text-brand-700">{p.order.company.name}</Link> : "—" },
    { key: "method", header: "Method", render: (p) => <span className="text-slate-700">{p.order.paymentMethod ? METHOD_LABEL[p.order.paymentMethod] ?? p.order.paymentMethod : "—"}</span> },
    {
      key: "provider",
      header: "Provider",
      render: (p) => (
        <div className="min-w-0">
          <div className="text-slate-700">{p.provider === "MOYASAR" ? "Moyasar" : "Manual"}</div>
          {p.providerPaymentId && <div className="max-w-[10rem] truncate font-mono text-xs text-slate-500" dir="ltr" title={p.providerPaymentId}>{p.providerPaymentId}</div>}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "end",
      render: (p) => <span className={`font-semibold tabular-nums ${p.amount < 0 ? "text-red-600" : "text-slate-900"}`} dir="ltr">{p.amount < 0 ? `−${formatSar(Math.abs(p.amount), lang)}` : formatSar(p.amount, lang)}</span>,
    },
    { key: "status", header: t("common.status"), render: (p) => <Badge tone={STATUS_TONE[p.status] ?? "slate"}>{p.status}</Badge> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (p) => p.status === "PAID" && p.amount > 0 && p.order.paymentStatus === "PAID" ? (
        <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => openRefund(p)}>Refund</Button>
      ) : null,
    },
  ];

  const rows = state.data?.data ?? [];
  const summary = state.data?.summary ?? {};
  const outstanding = state.data?.outstanding ?? { count: 0, amount: 0 };
  const sumOf = (key: PaymentRecordStatus) => summary[key] ?? { count: 0, amount: 0 };
  const filtered = !!(status || provider || debouncedQ.trim());

  return (
    <div>
      <PageHeader
        title={t("admin.payments")}
        subtitle="Every gateway and manual payment record, with refunds and outstanding balances."
        action={
          <>
            <Select name="status" value={status} onChange={(e) => { setStatus(e.target.value as PaymentRecordStatus | ""); setPage(1); }} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
            <Select name="provider" value={provider} onChange={(e) => { setProvider(e.target.value as PaymentProvider | ""); setPage(1); }} placeholder="All providers" options={[{ value: "MOYASAR", label: "Moyasar" }, { value: "MANUAL", label: "Manual" }]} />
            <Input
              name="q"
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); state.reload(); } }}
              placeholder="Order ref, gateway id or buyer"
              dir="ltr"
              className="w-64"
            />
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />

      {state.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatTile label="Paid" value={formatSar(sumOf("PAID").amount, lang)} sub={`${formatNumber(sumOf("PAID").count, lang)} payment${sumOf("PAID").count === 1 ? "" : "s"}`} tone="brand" />
          <StatTile label="Refunded" value={formatSar(sumOf("REFUNDED").amount, lang)} sub={`${formatNumber(sumOf("REFUNDED").count, lang)} refund${sumOf("REFUNDED").count === 1 ? "" : "s"}`} />
          <StatTile label="Failed" value={formatNumber(sumOf("FAILED").count, lang)} sub={`${formatSar(sumOf("FAILED").amount, lang)} attempted`} />
          <StatTile label="Initiated" value={formatNumber(sumOf("INITIATED").count, lang)} sub={`${formatSar(sumOf("INITIATED").amount, lang)} awaiting confirmation`} />
          <StatTile label="Outstanding" value={formatSar(outstanding.amount, lang)} sub={`${formatNumber(outstanding.count, lang)} unpaid order${outstanding.count === 1 ? "" : "s"}`} tone={outstanding.count > 0 ? "amber" : "default"} />
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
                description={filtered ? "Try clearing the status, provider or search filters." : "Payment records appear here as soon as buyers pay by card or a manual payment is recorded."}
                action={filtered ? <Button variant="outline" onClick={() => { setStatus(""); setProvider(""); setQ(""); setPage(1); }}>Clear filters</Button> : undefined}
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
              <div className="flex justify-between"><dt className="text-slate-500">Buyer</dt><dd className="font-medium text-slate-900">{refundTarget.order.buyer?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Supplier</dt><dd className="font-medium text-slate-900">{refundTarget.order.company?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid via</dt><dd className="font-medium text-slate-900">{refundTarget.provider === "MOYASAR" ? "Moyasar" : "Manual"}{refundTarget.order.paymentMethod ? ` · ${METHOD_LABEL[refundTarget.order.paymentMethod] ?? refundTarget.order.paymentMethod}` : ""}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid amount</dt><dd className="font-semibold tabular-nums text-brand-700">{formatSar(refundTarget.amount, lang)}</dd></div>
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
