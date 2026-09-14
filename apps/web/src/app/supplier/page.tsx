"use client";

import Link from "next/link";
import type { Bid } from "@mysupplier/shared";
import { api, type MarketplaceRfq } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, StatTile, StatusBadge, Table, VerifiedBadge, type Column } from "@/components/ui";

export default function SupplierOverview() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const city = user?.company?.city;

  const openRfqs = useAsync(() => api.marketplaceRfqs({ city, page: 1 }), [city]);
  const bids = useAsync(() => api.bids({ page: 1 }), []);
  const prices = useAsync(() => api.supplierPrices(1), []);

  const bidList = bids.data?.data ?? [];
  const won = bidList.filter((b) => b.status === "ACCEPTED").length;

  const rfqColumns: Column<MarketplaceRfq>[] = [
    { key: "ref", header: "Reference", render: (r) => <Link href={`/supplier/marketplace/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link> },
    { key: "title", header: "Title", render: (r) => r.title },
    { key: "items", header: "Items", align: "end", render: (r) => r.items?.length ?? 0 },
    { key: "closes", header: "Closes", render: (r) => <span className="text-slate-500">{formatDateTime(r.closesAt, lang)}</span> },
    { key: "bid", header: "", align: "end", render: (r) => (r.myBidId ? <Badge tone="green">Bid placed</Badge> : <LinkButton href={`/supplier/marketplace/${r.id}`} size="sm" variant="accent">Bid</LinkButton>) },
  ];
  const bidColumns: Column<Bid>[] = [
    { key: "rfq", header: "RFQ", render: (b) => <Link href={`/supplier/marketplace/${b.rfqId}`} className="font-medium text-brand-700 hover:underline">{b.rfq?.title ?? b.rfq?.reference ?? b.rfqId}</Link> },
    { key: "total", header: "Total", align: "end", render: (b) => <span className="tabular-nums font-semibold">{formatSar(b.totalPrice, lang)}</span> },
    { key: "status", header: t("common.status"), render: (b) => <StatusBadge status={b.status} /> },
    { key: "valid", header: "Valid until", render: (b) => <span className="text-slate-500">{formatDateTime(b.validUntil, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={user?.company?.name ?? "Supplier dashboard"}
        subtitle={
          <span className="inline-flex items-center gap-2">
            {city ? `Based in ${city}` : "Supplier account"}
            {user?.company && <VerifiedBadge verified={user.company.verified} />}
            {user?.company && !user.company.verified && <Badge tone="amber">Verification pending</Badge>}
          </span>
        }
        action={<LinkButton href="/supplier/marketplace" variant="accent">Browse open RFQs</LinkButton>}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={city ? `Open RFQs in ${city}` : "Open RFQs"} value={openRfqs.loading ? "…" : openRfqs.error ? "—" : openRfqs.data?.total ?? 0} tone="brand" />
        <StatTile label="My bids" value={bids.loading ? "…" : bids.error ? "—" : bids.data?.total ?? 0} />
        <StatTile label="Won" value={bids.loading ? "…" : won} sub="accepted bids on this page" />
        <StatTile label="Price listings" value={prices.loading ? "…" : prices.error ? "—" : prices.data?.total ?? 0} />
      </div>

      <Card className="mt-6">
        <CardHeader title={city ? `Open RFQs in ${city}` : "Open RFQs"} action={<Link href="/supplier/marketplace" className="text-sm font-semibold text-brand-700 hover:underline">{t("common.viewAll")} →</Link>} />
        {openRfqs.loading ? <LoadingBlock /> : openRfqs.error ? <div className="p-5"><Alert onRetry={openRfqs.reload}>{openRfqs.error}</Alert></div> : (
          <Table columns={rfqColumns} rows={(openRfqs.data?.data ?? []).slice(0, 5)} rowKey={(r) => r.id} empty={<EmptyState title="No open RFQs right now" description="Check the marketplace for RFQs in other cities." />} />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent bids" action={<Link href="/supplier/bids" className="text-sm font-semibold text-brand-700 hover:underline">{t("common.viewAll")} →</Link>} />
        {bids.loading ? <LoadingBlock /> : bids.error ? <div className="p-5"><Alert onRetry={bids.reload}>{bids.error}</Alert></div> : (
          <Table columns={bidColumns} rows={bidList.slice(0, 5)} rowKey={(b) => b.id} empty={<EmptyState title="No bids yet" action={<LinkButton href="/supplier/marketplace">Find RFQs to bid on</LinkButton>} />} />
        )}
      </Card>
    </div>
  );
}
