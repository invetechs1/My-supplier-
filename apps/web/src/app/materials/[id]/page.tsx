"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import type { PriceHistoryPoint, PriceListing } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, StatTile, StatusBadge, Table, VerifiedBadge, type Column } from "@/components/ui";

export default function MaterialDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t, lang } = useI18n();
  const state = useAsync(() => api.material(id), [id]);

  const listings = useMemo(() => [...(state.data?.listings ?? [])].sort((a, b) => a.price - b.price), [state.data]);

  if (state.loading) return <LoadingBlock className="min-h-[50vh]" />;
  if (state.error || !state.data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert onRetry={state.reload}>{state.error ?? "Material not found"}</Alert>
      </div>
    );

  const m = state.data;
  const s = m.summary;

  const columns: Column<PriceListing>[] = [
    {
      key: "supplier",
      header: "Supplier",
      render: (l) => (
        <div className="flex flex-wrap items-center gap-2">
          {l.company ? (
            <Link href={`/suppliers/${l.company.id}`} className="font-medium text-slate-900 hover:text-brand-700">
              {l.company.name}
            </Link>
          ) : (
            <span className="font-medium text-slate-700">{l.sourceName ?? "Market"}</span>
          )}
          {l.company && <VerifiedBadge verified={l.company.verified} />}
          {l.id === s.cheapestListingId && <Badge tone="amber">Best price</Badge>}
        </div>
      ),
    },
    { key: "city", header: t("common.city"), render: (l) => l.city },
    { key: "price", header: `Price / ${m.unit}`, align: "end", render: (l) => <span className="font-semibold tabular-nums text-slate-900">{formatSar(l.price, lang)}</span> },
    { key: "minQty", header: "Min qty", align: "end", render: (l) => `${l.minQty} ${m.unit}` },
    { key: "lead", header: "Lead time", align: "end", render: (l) => `${l.leadTimeDays} d` },
    { key: "source", header: "Source", render: (l) => <StatusBadge status={l.source} /> },
    { key: "updated", header: "Updated", render: (l) => <span className="text-slate-500" title={formatDate(l.updatedAt, lang)}>{timeAgo(l.updatedAt)}</span> },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/materials" className="hover:text-brand-700">{t("nav.materials")}</Link>
        {m.category && (
          <>
            <span className="mx-2">/</span>
            <Link href={`/materials?categoryId=${m.category.id}`} className="hover:text-brand-700">{lang === "ar" ? m.category.nameAr : m.category.name}</Link>
          </>
        )}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{lang === "ar" ? m.nameAr || m.name : m.name}</h1>
          <p className="mt-1 text-lg text-slate-500">{lang === "ar" ? m.name : m.nameAr}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
            <Badge tone="slate">SKU {m.sku}</Badge>
            <Badge tone="slate">Unit: {m.unit}</Badge>
            {m.brand && <Badge tone="blue">{m.brand}</Badge>}
          </div>
          {m.description && <p className="mt-4 max-w-2xl text-sm text-slate-600">{m.description}</p>}
        </div>
        <LinkButton href={`/dashboard/rfqs/new?materialId=${m.id}`} variant="accent" size="lg">
          {t("material.requestQuotes")}
        </LinkButton>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile label={t("price.lowest")} value={formatSar(s.min, lang)} tone="brand" />
        <StatTile label={t("price.average")} value={formatSar(s.avg, lang)} />
        <StatTile label={t("price.median")} value={formatSar(s.median, lang)} />
        <StatTile label={t("price.highest")} value={formatSar(s.max, lang)} />
        <StatTile label={t("price.suppliers")} value={s.count} sub={s.lastUpdated ? `Updated ${timeAgo(s.lastUpdated)}` : undefined} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("material.listings")} subtitle={`${listings.length} listings sorted by price`} />
          <Table columns={columns} rows={listings} rowKey={(l) => l.id} empty={<EmptyState title="No listings yet" description="Be the first supplier to publish a price for this material." />} />
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("material.history")} subtitle="Average market price over time" />
            <div className="p-4">
              <PriceHistoryChart points={m.history ?? []} lang={lang} />
            </div>
          </Card>
          {m.specs && Object.keys(m.specs).length > 0 && (
            <Card>
              <CardHeader title="Specifications" />
              <dl className="divide-y divide-slate-100 text-sm">
                {Object.entries(m.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-5 py-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium text-slate-900">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export function PriceHistoryChart({ points, lang, height = 180 }: { points: PriceHistoryPoint[]; lang: "en" | "ar"; height?: number }) {
  if (!points || points.length < 2) {
    return <p className="py-8 text-center text-sm text-slate-500">Not enough history yet.</p>;
  }
  const width = 320;
  const padX = 8;
  const padY = 12;
  const values = points.map((p) => p.avg);
  const mins = points.map((p) => p.min);
  const maxs = points.map((p) => p.max);
  const lo = Math.min(...mins, ...values);
  const hi = Math.max(...maxs, ...values);
  const span = hi - lo || 1;
  const x = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2);
  const y = (v: number) => padY + (1 - (v - lo) / span) * (height - padY * 2);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const band = [
    ...maxs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`),
    ...mins
      .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .reverse(),
    "Z",
  ].join(" ");
  const first = values[0];
  const last = values[values.length - 1];
  const change = first ? ((last - first) / first) * 100 : 0;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xl font-semibold tabular-nums text-slate-900">{formatSar(last, lang)}</span>
        <span className={change > 0 ? "text-sm font-medium text-red-600" : change < 0 ? "text-sm font-medium text-emerald-600" : "text-sm text-slate-500"}>
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}% over period
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Price history chart">
        <defs>
          <linearGradient id="hist-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0B6E4F" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0B6E4F" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={width - padX} y1={padY + f * (height - padY * 2)} y2={padY + f * (height - padY * 2)} stroke="#e2e8f0" strokeDasharray="3 3" />
        ))}
        <path d={band} fill="url(#hist-fill)" />
        <path d={line} fill="none" stroke="#0B6E4F" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last)} r="3.5" fill="#F2A900" stroke="#fff" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{formatDate(points[0].date, lang)}</span>
        <span>{formatDate(points[points.length - 1].date, lang)}</span>
      </div>
    </div>
  );
}
