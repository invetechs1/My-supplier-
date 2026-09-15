"use client";

import Link from "next/link";
import type { Order } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatDateTime, formatNumber, formatSar } from "@/lib/format";
import { Alert, Card, CardBody, CardHeader, EmptyState, LoadingBlock, PageHeader, PriceChange, StatTile, StatusBadge, Table, type Column } from "@/components/ui";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-emerald-500",
  CLOSED: "bg-slate-400",
  AWARDED: "bg-sky-500",
  CANCELLED: "bg-red-400",
};

export default function AdminOverview() {
  const { t, lang } = useI18n();
  const state = useAsync(() => api.adminStats(), []);
  const review = useAsync(() => api.imports({ status: "REVIEW", pageSize: 1 }), []);
  const unverified = useAsync(() => api.adminCompanies({ verified: "false", page: 1 }), []);
  const pendingPayouts = useAsync(() => api.adminPayouts({ status: "PENDING", page: 1 }), []);

  if (state.loading) return <LoadingBlock />;
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? "Could not load stats"}</Alert>;
  const s = state.data;
  const byStatus = Object.entries(s.rfqsByStatus ?? {});
  const maxStatus = Math.max(1, ...byStatus.map(([, v]) => v));

  const orderColumns: Column<Order>[] = [
    { key: "ref", header: "Reference", render: (o) => <span className="font-medium text-slate-900">{o.reference}</span> },
    { key: "supplier", header: "Supplier", render: (o) => o.company?.name ?? o.companyId },
    { key: "rfq", header: "RFQ", render: (o) => o.rfq?.title ?? o.rfqId },
    { key: "total", header: "Total", align: "end", render: (o) => <span className="font-semibold tabular-nums">{formatSar(o.total, lang)}</span> },
    { key: "status", header: t("common.status"), render: (o) => <StatusBadge status={o.status} /> },
    { key: "created", header: "Created", render: (o) => <span className="text-slate-500">{formatDateTime(o.createdAt, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Platform overview" subtitle="Key metrics across the marketplace." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label={t("stats.materials")} value={formatNumber(s.materials, lang)} />
        <StatTile label={t("stats.suppliers")} value={formatNumber(s.suppliers, lang)} />
        <StatTile label={t("stats.listings")} value={formatNumber(s.priceListings, lang)} />
        <StatTile label={t("stats.openRfqs")} value={formatNumber(s.openRfqs, lang)} tone="amber" />
        <StatTile label={t("stats.bids")} value={formatNumber(s.bids, lang)} />
        <StatTile label={t("stats.orders")} value={formatNumber(s.orders, lang)} />
        <StatTile label="GMV" value={`SAR ${formatCompact(s.gmv)}`} tone="brand" sub={formatSar(s.gmv, lang)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/admin/imports" className="block rounded-xl transition hover:shadow-card-hover">
          <StatTile
            label="Imports awaiting review"
            value={review.loading ? "…" : review.error ? "—" : formatNumber(review.data?.total ?? 0, lang)}
            sub={review.error ? review.error : "AI-read price lists, quotations & web pages →"}
            tone={(review.data?.total ?? 0) > 0 ? "amber" : "default"}
            className="h-full"
          />
        </Link>
        <Link href="/admin/companies?verified=false" className="block rounded-xl transition hover:shadow-card-hover">
          <StatTile
            label="Pending verifications"
            value={unverified.loading ? "…" : unverified.error ? "—" : formatNumber(unverified.data?.total ?? 0, lang)}
            sub={unverified.error ? unverified.error : "Companies awaiting document review →"}
            tone={(unverified.data?.total ?? 0) > 0 ? "amber" : "default"}
            className="h-full"
          />
        </Link>
        <Link href="/admin/payouts?status=PENDING" className="block rounded-xl transition hover:shadow-card-hover">
          <StatTile
            label="Pending payouts"
            value={pendingPayouts.loading ? "…" : pendingPayouts.error ? "—" : formatNumber(pendingPayouts.data?.total ?? 0, lang)}
            sub={pendingPayouts.error ? pendingPayouts.error : pendingPayouts.data ? `${formatSar(pendingPayouts.data.data.reduce((s, p) => s + p.amount, 0), lang)} on first page →` : "Supplier transfers to make →"}
            tone={(pendingPayouts.data?.total ?? 0) > 0 ? "amber" : "default"}
            className="h-full"
          />
        </Link>
        <Link href="/admin/outreach" className="block rounded-xl transition hover:shadow-card-hover">
          <StatTile label="Supplier outreach" value="Update links" sub="Nudge suppliers with stale prices →" className="h-full" />
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="RFQs by status" />
          <CardBody>
            {byStatus.length === 0 ? (
              <p className="text-sm text-slate-500">No RFQs yet.</p>
            ) : (
              <ul className="space-y-3">
                {byStatus.map(([status, count]) => (
                  <li key={status}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{status}</span>
                      <span className="tabular-nums text-slate-500">{count}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${STATUS_COLORS[status] ?? "bg-brand-500"}`} style={{ width: `${Math.max(2, (count / maxStatus) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Top categories" subtitle="By price index" />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">Category</th>
                  <th className="px-4 py-2 text-end">Materials</th>
                  <th className="px-4 py-2 text-end">Avg</th>
                  <th className="px-4 py-2 text-end">30d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(s.topCategories ?? []).map((c) => (
                  <tr key={c.category.id}>
                    <td className="px-4 py-2"><Link href={`/materials?categoryId=${c.category.id}`} className="font-medium text-slate-900 hover:text-brand-700">{c.category.name}</Link></td>
                    <td className="px-4 py-2 text-end tabular-nums">{c.materialCount}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{formatSar(c.avgPrice, lang)}</td>
                    <td className="px-4 py-2 text-end"><PriceChange value={c.changePct30d} /></td>
                  </tr>
                ))}
                {(s.topCategories ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent orders" />
        <Table columns={orderColumns} rows={s.recentOrders ?? []} rowKey={(o) => o.id} empty={<EmptyState title="No orders yet" />} />
      </Card>
    </div>
  );
}
