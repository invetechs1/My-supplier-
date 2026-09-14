"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { PriceListing } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, LoadingBlock, StatTile, Table, VerifiedBadge, type Column } from "@/components/ui";

export default function SupplierProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useI18n();
  const state = useAsync(() => api.supplier(id), [id]);

  if (state.loading) return <LoadingBlock className="min-h-[50vh]" />;
  if (state.error || !state.data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert onRetry={state.reload}>{state.error ?? "Supplier not found"}</Alert>
      </div>
    );
  const c = state.data;

  const columns: Column<PriceListing>[] = [
    {
      key: "material",
      header: "Material",
      render: (l) =>
        l.material ? (
          <Link href={`/materials/${l.material.id}`} className="font-medium text-slate-900 hover:text-brand-700">
            {lang === "ar" ? l.material.nameAr || l.material.name : l.material.name}
            <span className="ms-2 text-xs font-normal text-slate-400">{l.material.sku}</span>
          </Link>
        ) : (
          l.materialId
        ),
    },
    { key: "city", header: "City", render: (l) => l.city },
    { key: "price", header: "Price", align: "end", render: (l) => <span className="font-semibold tabular-nums">{formatSar(l.price, lang)}{l.material ? <span className="text-xs font-normal text-slate-400"> / {l.material.unit}</span> : null}</span> },
    { key: "minQty", header: "Min qty", align: "end", render: (l) => l.minQty },
    { key: "lead", header: "Lead time", align: "end", render: (l) => `${l.leadTimeDays} d` },
    { key: "updated", header: "Updated", render: (l) => <span className="text-slate-500">{timeAgo(l.updatedAt)}</span> },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/suppliers" className="hover:text-brand-700">Suppliers</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{c.name}</span>
      </nav>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-xl font-semibold text-white">{c.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-slate-900">{c.name}</h1>
                <VerifiedBadge verified={c.verified} />
              </div>
              {c.nameAr && <p className="text-slate-500">{c.nameAr}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="slate">{c.type}</Badge>
                <Badge tone="slate">{c.city}{c.region ? `, ${c.region}` : ""}</Badge>
                <Badge tone="amber">★ {c.rating.toFixed(1)} ({c.ratingCount})</Badge>
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            {c.crNumber && (<><dt className="text-slate-500">CR number</dt><dd className="font-medium text-slate-900">{c.crNumber}</dd></>)}
            {c.vatNumber && (<><dt className="text-slate-500">VAT number</dt><dd className="font-medium text-slate-900">{c.vatNumber}</dd></>)}
            {c.phone && (<><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900" dir="ltr">{c.phone}</dd></>)}
            {c.website && (<><dt className="text-slate-500">Website</dt><dd><a href={c.website} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">{c.website}</a></dd></>)}
            <dt className="text-slate-500">Member since</dt><dd className="font-medium text-slate-900">{formatDate(c.createdAt, lang)}</dd>
          </dl>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatTile label="Price listings" value={c.stats.listings} />
        <StatTile label="Bids submitted" value={c.stats.bids} />
        <StatTile label="Bids won" value={c.stats.wonBids} tone="brand" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Price list" subtitle="Published prices by this supplier" />
        <Table columns={columns} rows={c.listings ?? []} rowKey={(l) => l.id} empty={<EmptyState title="No published prices" />} />
      </Card>
    </div>
  );
}
