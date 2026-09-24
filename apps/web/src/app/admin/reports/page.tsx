"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { AdminReports, ReportBucket, SeriesPoint } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatDate, formatNumber, formatSar } from "@/lib/format";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, LoadingBlock, PageHeader, Select, StatTile, Table, type Column } from "@/components/ui";
import { BarChart, LineChart } from "@/components/charts";

const RANGES = [7, 30, 90, 180, 365] as const;
type RangeDays = (typeof RANGES)[number];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-400",
  CONFIRMED: "bg-sky-500",
  IN_TRANSIT: "bg-violet-500",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-red-400",
};

const METHOD_LABEL: Record<string, string> = {
  COD: "Cash on delivery",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
};

function pctText(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** Sub-line for a StatTile: signed change vs the previous period, green up / red down. */
function ChangeSub({ value, invert = false }: { value: number | null | undefined; invert?: boolean }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="text-slate-400">No previous period</span>;
  const good = invert ? value < 0 : value > 0;
  const flat = value === 0;
  return (
    <span className={flat ? "text-slate-500" : good ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
      {pctText(value)} vs previous period
    </span>
  );
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(report: AdminReports) {
  const header = ["date", "gmv", "orders"];
  const lines = report.daily.map((d) => [d.date, d.gmv.toFixed(2), String(d.orders)].map(csvEscape).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mysupplier-report-${report.days}d-${report.since.slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** List with thin proportional bars, in the style of "RFQs by status" on the overview. */
function BucketBars({
  rows,
  valueOf,
  format,
  colorOf,
  label,
}: {
  rows: ReportBucket[];
  valueOf: (b: ReportBucket) => number;
  format: (v: number) => string;
  colorOf?: (b: ReportBucket) => string;
  label?: (b: ReportBucket) => string;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No data for this period.</p>;
  const max = Math.max(1, ...rows.map(valueOf));
  return (
    <ul className="space-y-3">
      {rows.map((b) => {
        const v = valueOf(b);
        return (
          <li key={b.id}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-slate-700">{label ? label(b) : b.name}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{format(v)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${colorOf ? colorOf(b) : "bg-brand-500"}`} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminReportsPage() {
  const { t, lang } = useI18n();
  const [days, setDays] = useState<RangeDays>(30);
  const state = useAsync(() => api.adminReports(days), [days]);

  const rangeSelect = (
    <Select
      name="days"
      value={String(days)}
      onChange={(e) => setDays(Number(e.target.value) as RangeDays)}
      options={RANGES.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
    />
  );

  const header = (
    <PageHeader
      title={t("admin.reports")}
      subtitle={state.data ? `Marketplace performance since ${formatDate(state.data.since, lang)}, compared with the ${state.data.days} days before.` : "Marketplace performance over a rolling window."}
      action={
        <>
          {rangeSelect}
          <Button variant="outline" onClick={() => state.data && downloadCsv(state.data)} disabled={!state.data || state.data.daily.length === 0}>
            Download CSV
          </Button>
        </>
      }
    />
  );

  if (state.loading) return <div>{header}<LoadingBlock /></div>;
  if (state.error || !state.data) return <div>{header}<Alert onRetry={state.reload}>{state.error ?? "Could not load reports"}</Alert></div>;

  const r = state.data;
  const totals = r.totals;
  const gmvPoints: SeriesPoint[] = r.daily.map((d) => ({ date: d.date, value: d.gmv }));
  const orderPoints: SeriesPoint[] = r.daily.map((d) => ({ date: d.date, value: d.orders }));
  const gmvTotal = Math.max(totals.gmv, 0);
  const noActivity = totals.orders === 0 && totals.rfqs === 0 && totals.newUsers === 0;

  const productColumns: Column<ReportBucket>[] = [
    { key: "name", header: "Product", render: (b) => <span className="font-medium text-slate-900">{b.name}</span> },
    { key: "qty", header: "Qty", align: "end", render: (b) => <span className="tabular-nums">{formatNumber(b.quantity, lang)}</span> },
    { key: "orders", header: "Orders", align: "end", render: (b) => <span className="tabular-nums">{formatNumber(b.orders, lang)}</span> },
    { key: "revenue", header: "Revenue", align: "end", render: (b) => <span className="font-semibold tabular-nums">{formatSar(b.revenue, lang)}</span> },
  ];

  const supplierColumns: Column<ReportBucket>[] = [
    { key: "name", header: "Supplier", render: (b) => <Link href={`/admin/companies/${b.id}`} className="font-medium text-brand-700 hover:underline">{b.name}</Link> },
    { key: "orders", header: "Orders", align: "end", render: (b) => <span className="tabular-nums">{formatNumber(b.orders, lang)}</span> },
    { key: "revenue", header: "Revenue", align: "end", render: (b) => <span className="font-semibold tabular-nums">{formatSar(b.revenue, lang)}</span> },
    {
      key: "share",
      header: "Share of GMV",
      className: "w-40",
      render: (b) => {
        const share = gmvTotal > 0 ? (b.revenue / gmvTotal) * 100 : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(1, share))}%` }} />
            </div>
            <span className="w-12 shrink-0 text-end text-xs tabular-nums text-slate-500">{share.toFixed(1)}%</span>
          </div>
        );
      },
    },
  ];

  const categoryColumns: Column<ReportBucket>[] = [
    { key: "name", header: "Category", render: (b) => <span className="font-medium text-slate-900">{b.name}</span> },
    { key: "orders", header: "Orders", align: "end", render: (b) => <span className="tabular-nums">{formatNumber(b.orders, lang)}</span> },
    { key: "qty", header: "Qty", align: "end", render: (b) => <span className="tabular-nums">{formatNumber(b.quantity, lang)}</span> },
    { key: "revenue", header: "Revenue", align: "end", render: (b) => <span className="font-semibold tabular-nums">{formatSar(b.revenue, lang)}</span> },
  ];

  return (
    <div>
      {header}

      {noActivity && (
        <Card className="mb-6">
          <EmptyState title="No activity in this period" description="Orders, RFQs and sign-ups will appear here once buyers and suppliers start transacting. Try a longer range." action={<Button variant="outline" onClick={() => setDays(365)}>Show last 365 days</Button>} />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile label="GMV" value={formatSar(totals.gmv, lang)} sub={<ChangeSub value={totals.gmvChangePct} />} />
        <StatTile label="Orders" value={formatNumber(totals.orders, lang)} sub={<ChangeSub value={totals.ordersChangePct} />} />
        <StatTile label="Average order value" value={formatSar(totals.aov, lang)} sub="Per order in this period" />
        <StatTile label="Active buyers" value={formatNumber(totals.activeBuyers, lang)} sub="Placed at least one order" />
        <StatTile label="New users" value={formatNumber(totals.newUsers, lang)} sub={<ChangeSub value={totals.newUsersChangePct} />} />
        <StatTile label="RFQ conversion" value={`${totals.rfqConversionPct.toFixed(1)}%`} sub={`${formatNumber(totals.rfqs, lang)} RFQs · ${formatNumber(totals.bids, lang)} bids`} />
        <StatTile label="Paid share" value={`${totals.paidShare.toFixed(1)}%`} sub="Orders already paid" />
        <StatTile label="Discounts given" value={formatSar(totals.discounts, lang)} sub="Coupons & promotions" />
        <StatTile label="Open support tickets" value={formatNumber(totals.supportOpen, lang)} tone={totals.supportOpen > 0 ? "amber" : "default"} sub={totals.supportOpen > 0 ? "Awaiting a reply" : "Inbox is clear"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Daily GMV" subtitle={`Order value per day over the last ${r.days} days`} />
          <CardBody>
            <LineChart points={gmvPoints} lang={lang} height={220} format={(v) => `SAR ${formatCompact(v)}`} label="Daily GMV" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Daily orders" subtitle="Orders placed per day" />
          <CardBody>
            <BarChart points={orderPoints} lang={lang} height={220} format={(v) => formatNumber(v, lang)} label="Daily orders" />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top products" subtitle="By revenue" />
          <Table columns={productColumns} rows={r.topProducts} rowKey={(b) => b.id} dense empty={<EmptyState title="No products sold" description="Product sales will rank here once orders are placed." />} />
        </Card>
        <Card>
          <CardHeader title="Top suppliers" subtitle="By revenue" />
          <Table columns={supplierColumns} rows={r.topSuppliers} rowKey={(b) => b.id} dense empty={<EmptyState title="No supplier sales" description="Suppliers will rank here once they receive orders." />} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by category" />
          <Table columns={categoryColumns} rows={r.byCategory} rowKey={(b) => b.id} dense empty={<EmptyState title="No category revenue" />} />
        </Card>
        <Card>
          <CardHeader title="Orders by city" subtitle="Delivery destinations" />
          <CardBody>
            <BucketBars rows={r.byCity} valueOf={(b) => b.orders} format={(v) => `${formatNumber(v, lang)} order${v === 1 ? "" : "s"}`} colorOf={() => "bg-sky-500"} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Payment method split" subtitle="Revenue by how buyers paid" />
          <CardBody>
            <BucketBars
              rows={r.byPaymentMethod}
              valueOf={(b) => b.revenue}
              format={(v) => formatSar(v, lang)}
              label={(b) => `${METHOD_LABEL[b.name] ?? b.name.replace(/_/g, " ")} · ${formatNumber(b.orders, lang)} orders`}
              colorOf={(b) => (b.name === "CARD" ? "bg-violet-500" : b.name === "BANK_TRANSFER" ? "bg-sky-500" : "bg-amber-400")}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Orders by status" />
          <CardBody>
            <BucketBars
              rows={r.byStatus}
              valueOf={(b) => b.orders}
              format={(v) => formatNumber(v, lang)}
              label={(b) => b.name.replace(/_/g, " ")}
              colorOf={(b) => STATUS_COLORS[b.name] ?? "bg-brand-500"}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
