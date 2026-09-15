"use client";

import Link from "next/link";
import { useState } from "react";
import type { Payout, StatementLine } from "@mysupplier/shared";
import { api, financeStatementCsvUrl } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, LoadingBlock, PageHeader, Pagination, StatTile, StatusBadge, Table, type Column } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/Orders";
import { RoleGuard } from "@/components/RoleGuard";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function FinanceInner() {
  const { t, lang } = useI18n();
  const summary = useAsync(() => api.financeSummary(), []);
  const payouts = useAsync(() => api.supplierPayouts(), []);
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 86400000);
    return { from: isoDay(from), to: isoDay(to) };
  });
  const [applied, setApplied] = useState(range);
  const [page, setPage] = useState(1);
  const statement = useAsync(() => api.financeStatement({ from: applied.from || undefined, to: applied.to || undefined, page }), [applied, page]);
  const money = (v: number | null | undefined) => formatSar(v, lang);

  const columns: Column<StatementLine>[] = [
    { key: "order", header: "Order", render: (l) => <Link href={`/supplier/orders/${l.order.id}`} className="font-medium text-brand-700 hover:underline">{l.order.reference}</Link> },
    { key: "date", header: "Date", render: (l) => <span className="text-slate-500">{formatDate(l.order.createdAt, lang)}</span> },
    { key: "status", header: t("common.status"), render: (l) => <StatusBadge status={l.order.status} /> },
    { key: "payment", header: "Payment", render: (l) => <span className="inline-flex items-center gap-1"><PaymentStatusBadge status={l.order.paymentStatus} /><span className="text-xs text-slate-500">{l.order.paymentMethod ?? ""}</span></span> },
    { key: "gross", header: "Gross", align: "end", render: (l) => <span className="tabular-nums">{money(l.gross)}</span> },
    { key: "commission", header: "Commission", align: "end", render: (l) => <span className="tabular-nums text-red-700">−{money(l.commission)} <span className="text-xs text-slate-400">({l.commissionPct}%)</span></span> },
    { key: "net", header: "Net", align: "end", render: (l) => <span className="font-semibold tabular-nums text-slate-900">{money(l.net)}</span> },
    { key: "payout", header: "Payout", render: (l) => l.payout ? <Badge tone={l.payout.status === "PAID" ? "green" : "amber"} title={l.payout.reference ?? undefined}>{l.payout.status}</Badge> : <Badge tone="slate">Not yet</Badge> },
  ];

  const payoutColumns: Column<Payout>[] = [
    { key: "period", header: "Period", render: (p) => <span className="font-medium text-slate-900">{formatDate(p.periodStart, lang)} – {formatDate(p.periodEnd, lang)}</span> },
    { key: "orders", header: "Orders", align: "end", render: (p) => p.orderCount },
    { key: "amount", header: "Amount", align: "end", render: (p) => <span className="font-semibold tabular-nums">{money(p.amount)}</span> },
    { key: "status", header: t("common.status"), render: (p) => <Badge tone={p.status === "PAID" ? "green" : "amber"}>{p.status}</Badge> },
    { key: "ref", header: "Reference", render: (p) => <span className="font-mono text-xs" dir="ltr">{p.reference ?? "—"}</span> },
    { key: "paid", header: "Paid at", render: (p) => <span className="text-slate-500">{p.paidAt ? formatDateTime(p.paidAt, lang) : "—"}</span> },
  ];

  const s = summary.data;

  return (
    <div>
      <PageHeader title={t("sup.finance")} subtitle="Earnings, platform commission and payouts to your bank account." action={<Link href="/supplier/company" className="text-sm font-semibold text-brand-700 hover:underline">Bank details →</Link>} />
      {summary.error && <Alert className="mb-4" onRetry={summary.reload}>{summary.error}</Alert>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Gross paid" value={summary.loading ? "…" : money(s?.grossPaid)} sub="Paid orders, incl. VAT" />
        <StatTile label={`Commission (${s?.commissionPct ?? "…"}%)`} value={summary.loading ? "…" : `−${money(s?.commission)}`} sub="Platform fee" />
        <StatTile label="Net earned" value={summary.loading ? "…" : money(s?.netEarned)} tone="brand" sub="After commission" />
        <StatTile label="Paid out" value={summary.loading ? "…" : money(s?.paidOut)} sub="Transferred to your bank" />
        <StatTile label="Pending payout" value={summary.loading ? "…" : money(s?.pendingPayout)} tone={(s?.pendingPayout ?? 0) > 0 ? "amber" : "default"} sub="Paid & delivered, next payout run" />
        <StatTile label="Awaiting delivery" value={summary.loading ? "…" : money(s?.awaitingDelivery)} sub="Paid, released after delivery" />
        <StatTile label="Unpaid receivables" value={summary.loading ? "…" : money(s?.unpaidReceivables)} sub="COD / bank transfer to collect" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Statement"
          subtitle="One line per order with gross, commission and net."
          action={
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setApplied(range);
              }}
            >
              <Input label="From" name="from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} dir="ltr" />
              <Input label="To" name="to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} dir="ltr" />
              <Button type="submit" variant="outline">Apply</Button>
              <a href={financeStatementCsvUrl({ from: applied.from || undefined, to: applied.to || undefined })} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                Download CSV
              </a>
            </form>
          }
        />
        {statement.loading ? <LoadingBlock /> : statement.error ? <div className="p-5"><Alert onRetry={statement.reload}>{statement.error}</Alert></div> : (
          <>
            <Table columns={columns} rows={statement.data?.data ?? []} rowKey={(l) => l.order.id} empty={<EmptyState title="No orders in this period" description="Try a wider date range." />} />
            {statement.data && <Pagination page={statement.data.page} pageSize={statement.data.pageSize} total={statement.data.total} onChange={setPage} />}
          </>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Payouts" subtitle="Net of paid and delivered orders, transferred weekly to the IBAN on file." />
        {payouts.loading ? <LoadingBlock /> : payouts.error ? <div className="p-5"><Alert onRetry={payouts.reload}>{payouts.error}</Alert></div> : (
          <Table columns={payoutColumns} rows={payouts.data ?? []} rowKey={(p) => p.id} empty={<EmptyState title="No payouts yet" description="Payouts are generated once you have paid and delivered orders." />} />
        )}
      </Card>
    </div>
  );
}

export default function SupplierFinancePage() {
  return (
    <RoleGuard area="finance">
      <FinanceInner />
    </RoleGuard>
  );
}
