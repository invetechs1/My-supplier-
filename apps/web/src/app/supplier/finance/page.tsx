"use client";

import Link from "next/link";
import { useState } from "react";
import type { Payout, PayoutStatus, StatementLine } from "@mysupplier/shared";
import { api, financeStatementCsvPath, openDownload } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDate, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, LoadingBlock, PageHeader, Pagination, StatTile, StatusBadge, Table, type Column } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/Orders";
import { RoleGuard } from "@/components/RoleGuard";

const PAYOUT_STATUS_KEY: Record<PayoutStatus, TranslationKey> = {
  PENDING: "sup.finance.payoutStatus.PENDING",
  PAID: "sup.finance.payoutStatus.PAID",
};

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
    { key: "order", header: t("product.order"), render: (l) => <Link href={`/supplier/orders/${l.order.id}`} className="font-medium text-brand-700 hover:underline">{l.order.reference}</Link> },
    { key: "date", header: t("sup.finance.date"), render: (l) => <span className="text-slate-500">{formatDate(l.order.createdAt, lang)}</span> },
    { key: "status", header: t("common.status"), render: (l) => <StatusBadge status={l.order.status} /> },
    { key: "payment", header: t("sup.dash.col.payment"), render: (l) => <span className="inline-flex items-center gap-1"><PaymentStatusBadge status={l.order.paymentStatus} /><span className="text-xs text-slate-500">{l.order.paymentMethod ?? ""}</span></span> },
    { key: "gross", header: t("sup.finance.gross"), align: "end", render: (l) => <span className="tabular-nums">{money(l.gross)}</span> },
    { key: "commission", header: t("sup.finance.commission"), align: "end", render: (l) => <span className="tabular-nums text-red-700">−{money(l.commission)} <span className="text-xs text-slate-400">({l.commissionPct}%)</span></span> },
    { key: "net", header: t("sup.finance.net"), align: "end", render: (l) => <span className="font-semibold tabular-nums text-slate-900">{money(l.net)}</span> },
    { key: "payout", header: t("sup.finance.payout"), render: (l) => l.payout ? <Badge tone={l.payout.status === "PAID" ? "green" : "amber"} title={l.payout.reference ?? undefined}>{t(PAYOUT_STATUS_KEY[l.payout.status])}</Badge> : <Badge tone="slate">{t("sup.finance.notYet")}</Badge> },
  ];

  const payoutColumns: Column<Payout>[] = [
    { key: "period", header: t("sup.finance.period"), render: (p) => <span className="font-medium text-slate-900">{formatDate(p.periodStart, lang)} – {formatDate(p.periodEnd, lang)}</span> },
    { key: "orders", header: t("sup.orders"), align: "end", render: (p) => p.orderCount },
    { key: "amount", header: t("sup.finance.amount"), align: "end", render: (p) => <span className="font-semibold tabular-nums">{money(p.amount)}</span> },
    { key: "status", header: t("common.status"), render: (p) => <Badge tone={p.status === "PAID" ? "green" : "amber"}>{t(PAYOUT_STATUS_KEY[p.status])}</Badge> },
    { key: "ref", header: t("checkout.reference"), render: (p) => <span className="font-mono text-xs" dir="ltr">{p.reference ?? "—"}</span> },
    { key: "paid", header: t("sup.finance.paidAt"), render: (p) => <span className="text-slate-500">{p.paidAt ? formatDateTime(p.paidAt, lang) : "—"}</span> },
  ];

  const s = summary.data;

  return (
    <div>
      <PageHeader title={t("sup.finance")} subtitle={t("sup.finance.subtitle")} action={<Link href="/supplier/company" className="text-sm font-semibold text-brand-700 hover:underline">{t("sup.finance.bankDetails")}</Link>} />
      {summary.error && <Alert className="mb-4" onRetry={summary.reload}>{summary.error}</Alert>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={t("sup.finance.grossPaid")} value={summary.loading ? "…" : money(s?.grossPaid)} sub={t("sup.finance.grossPaidSub")} />
        <StatTile label={`${t("sup.finance.commission")} (${s?.commissionPct ?? "…"}%)`} value={summary.loading ? "…" : `−${money(s?.commission)}`} sub={t("sup.finance.platformFee")} />
        <StatTile label={t("sup.finance.netEarned")} value={summary.loading ? "…" : money(s?.netEarned)} tone="brand" sub={t("sup.finance.afterCommission")} />
        <StatTile label={t("sup.finance.paidOut")} value={summary.loading ? "…" : money(s?.paidOut)} sub={t("sup.finance.paidOutSub")} />
        <StatTile label={t("sup.finance.pendingPayout")} value={summary.loading ? "…" : money(s?.pendingPayout)} tone={(s?.pendingPayout ?? 0) > 0 ? "amber" : "default"} sub={t("sup.finance.pendingPayoutSub")} />
        <StatTile label={t("sup.finance.awaitingDelivery")} value={summary.loading ? "…" : money(s?.awaitingDelivery)} sub={t("sup.finance.awaitingDeliverySub")} />
        <StatTile label={t("sup.finance.unpaidReceivables")} value={summary.loading ? "…" : money(s?.unpaidReceivables)} sub={t("sup.finance.unpaidReceivablesSub")} />
      </div>

      <Card className="mt-6">
        <CardHeader
          title={t("sup.finance.statement")}
          subtitle={t("sup.finance.statementSubtitle")}
          action={
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setApplied(range);
              }}
            >
              <Input label={t("sup.finance.from")} name="from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} dir="ltr" />
              <Input label={t("sup.finance.to")} name="to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} dir="ltr" />
              <Button type="submit" variant="outline">{t("common.apply")}</Button>
              <button type="button" onClick={() => void openDownload(financeStatementCsvPath(), "_blank", { from: applied.from || undefined, to: applied.to || undefined })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                {t("sup.finance.downloadCsv")}
              </button>
            </form>
          }
        />
        {statement.loading ? <LoadingBlock /> : statement.error ? <div className="p-5"><Alert onRetry={statement.reload}>{statement.error}</Alert></div> : (
          <>
            <Table columns={columns} rows={statement.data?.data ?? []} rowKey={(l) => l.order.id} empty={<EmptyState title={t("sup.finance.noOrdersPeriod")} description={t("sup.finance.tryWider")} />} />
            {statement.data && <Pagination page={statement.data.page} pageSize={statement.data.pageSize} total={statement.data.total} onChange={setPage} />}
          </>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title={t("sup.finance.payouts")} subtitle={t("sup.finance.payoutsSubtitle")} />
        {payouts.loading ? <LoadingBlock /> : payouts.error ? <div className="p-5"><Alert onRetry={payouts.reload}>{payouts.error}</Alert></div> : (
          <Table columns={payoutColumns} rows={payouts.data ?? []} rowKey={(p) => p.id} empty={<EmptyState title={t("sup.finance.noPayouts")} description={t("sup.finance.noPayoutsDesc")} />} />
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
