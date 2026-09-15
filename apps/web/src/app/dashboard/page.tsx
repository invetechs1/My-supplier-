"use client";

import Link from "next/link";
import type { Order, Rfq } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatSar } from "@/lib/format";
import { Alert, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, StatTile, StatusBadge, Table, type Column } from "@/components/ui";

export default function BuyerOverview() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const rfqs = useAsync(() => api.rfqs({ page: 1 }), []);
  const orders = useAsync(() => api.orders(1), []);

  const list = rfqs.data?.data ?? [];
  const counts = {
    total: rfqs.data?.total ?? 0,
    open: list.filter((r) => r.status === "OPEN").length,
    awarded: list.filter((r) => r.status === "AWARDED").length,
    bids: list.reduce((sum, r) => sum + (r.bidCount ?? 0), 0),
  };

  const rfqColumns: Column<Rfq>[] = [
    { key: "ref", header: "Reference", render: (r) => <Link href={`/dashboard/rfqs/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link> },
    { key: "title", header: "Title", render: (r) => r.title },
    { key: "city", header: t("common.city"), render: (r) => r.deliveryCity },
    { key: "bids", header: "Bids", align: "end", render: (r) => r.bidCount ?? 0 },
    { key: "status", header: t("common.status"), render: (r) => <StatusBadge status={r.status} /> },
    { key: "closes", header: "Closes", render: (r) => <span className="text-slate-500">{formatDateTime(r.closesAt, lang)}</span> },
  ];
  const orderColumns: Column<Order>[] = [
    { key: "ref", header: "Reference", render: (o) => <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.reference}</Link> },
    { key: "supplier", header: "Supplier", render: (o) => o.company?.name ?? "—" },
    { key: "total", header: "Total", align: "end", render: (o) => <span className="tabular-nums font-semibold">{formatSar(o.total, lang)}</span> },
    { key: "status", header: t("common.status"), render: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name.split(" ")[0] ?? ""}`}
        subtitle="Track your requests for quotation, bids and orders."
        action={<LinkButton href="/dashboard/rfqs/new" variant="accent">+ {t("dash.newRfq")}</LinkButton>}
      />
      {rfqs.error && <Alert className="mb-4" onRetry={rfqs.reload}>{rfqs.error}</Alert>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total RFQs" value={rfqs.loading ? "…" : counts.total} tone="brand" />
        <StatTile label="Open RFQs" value={rfqs.loading ? "…" : counts.open} sub="on this page" />
        <StatTile label="Awarded" value={rfqs.loading ? "…" : counts.awarded} />
        <StatTile label="Bids received" value={rfqs.loading ? "…" : counts.bids} />
      </div>

      <Link href="/boq" className="mt-6 block rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-card transition hover:shadow-card-hover">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-900">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7.5 3.75h9A1.5 1.5 0 0118 5.25v13.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 18.75V5.25a1.5 1.5 0 011.5-1.5zM9 8h6" />
              </svg>
            </span>
            <div>
              <p className="text-base font-semibold text-slate-900">{t("boq.paste")}</p>
              <p className="text-sm text-slate-600">Price a whole bill of quantities across every supplier, then send it as an RFQ in one click.</p>
            </div>
          </div>
          <span className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">{t("boq.research")} →</span>
        </div>
      </Link>

      <Link href="/dashboard/quotations" className="mt-4 block rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-5 shadow-card transition hover:shadow-card-hover">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" />
              </svg>
            </span>
            <div>
              <p className="text-base font-semibold text-slate-900">Upload a quotation</p>
              <p className="text-sm text-slate-600">Got a supplier quote? Our AI reads it and adds the prices to the market data as quoted prices — and you see the supplier&apos;s other prices in return.</p>
            </div>
          </div>
          <span className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">{t("dash.quotations")} →</span>
        </div>
      </Link>

      <Card className="mt-6">
        <CardHeader title="Recent RFQs" action={<Link href="/dashboard/rfqs" className="text-sm font-semibold text-brand-700 hover:underline">{t("common.viewAll")} →</Link>} />
        {rfqs.loading ? (
          <LoadingBlock />
        ) : (
          <Table
            columns={rfqColumns}
            rows={list.slice(0, 5)}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No RFQs yet" description="Create your first request for quotation to start receiving bids." action={<LinkButton href="/dashboard/rfqs/new">Create RFQ</LinkButton>} />}
          />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent orders" action={<Link href="/dashboard/orders" className="text-sm font-semibold text-brand-700 hover:underline">{t("common.viewAll")} →</Link>} />
        {orders.loading ? (
          <LoadingBlock />
        ) : orders.error ? (
          <div className="p-5"><Alert onRetry={orders.reload}>{orders.error}</Alert></div>
        ) : (
          <Table columns={orderColumns} rows={(orders.data?.data ?? []).slice(0, 5)} rowKey={(o) => o.id} empty={<EmptyState title="No orders yet" />} />
        )}
      </Card>
    </div>
  );
}
