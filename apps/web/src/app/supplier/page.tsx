"use client";

import Link from "next/link";
import type { OrderExtended, OrderStatus, Review, SupplierDashboard } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { canManageCompany, companyRoleOf, useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatCompact, formatDateTime, formatNumber, formatPct, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, Stars, StatusBadge, Table, VerificationBadge, type Column } from "@/components/ui";
import { BarChart, HorizontalBars, LineChart, Sparkline } from "@/components/charts";
import { OrderTypeBadge, PaymentStatusBadge } from "@/components/Orders";

const STATUS_ORDER: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: "bg-amber-500",
  CONFIRMED: "bg-sky-500",
  IN_TRANSIT: "bg-violet-500",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-red-400",
};

function Kpi({ label, value, sub, href, tone, spark }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: "brand" | "amber" | "default"; spark?: React.ReactNode }) {
  const tones = { brand: "bg-brand-600 border-brand-600 text-white", amber: "bg-amber-50 border-amber-200", default: "bg-white border-slate-200" };
  const inner = (
    <div className={cn("flex h-full flex-col rounded-xl border p-4 shadow-card", tones[tone ?? "default"], href && "transition hover:shadow-card-hover")}>
      <p className={cn("text-xs font-medium uppercase tracking-wide", tone === "brand" ? "text-brand-100" : "text-slate-500")}>{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={cn("text-2xl font-semibold tabular-nums", tone === "brand" ? "text-white" : "text-slate-900")}>{value}</p>
        {spark}
      </div>
      {sub && <p className={cn("mt-1 text-xs", tone === "brand" ? "text-brand-100" : "text-slate-500")}>{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-xl">{inner}</Link> : inner;
}

function GettingStarted({ d, hasBranch }: { d: SupplierDashboard; hasBranch: boolean }) {
  const c = d.company;
  const items = [
    { done: c.verificationStatus === "VERIFIED", label: "Get verified", detail: c.verificationStatus === "UNDER_REVIEW" ? "Your documents are being reviewed." : "Upload your CR and VAT certificate so buyers trust your offers.", href: "/supplier/documents" },
    { done: !!c.logoUrl, label: "Add your logo", detail: "Shown on your storefront and in the shop.", href: "/supplier/company" },
    { done: d.kpis.listings >= 5, label: "Publish at least 5 prices", detail: `${d.kpis.listings} published so far. Import a PDF/Excel price list in one go.`, href: "/supplier/imports" },
    { done: (c.citiesServed?.length ?? 0) > 0, label: "Set the cities you deliver to", detail: "Buyers filter by city; you only see RFQs for cities you serve.", href: "/supplier/company" },
    { done: hasBranch, label: "Add a branch / warehouse", detail: "Track stock per location and print delivery notes with the right address.", href: "/supplier/branches" },
  ];
  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
      <CardHeader title="Getting started" subtitle="Complete these steps to start winning orders." />
      <ul className="divide-y divide-amber-100">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-3 px-5 py-3">
            <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", it.done ? "bg-emerald-500 text-white" : "border-2 border-amber-400 bg-white text-transparent")}>✓</span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", it.done ? "text-slate-500 line-through" : "text-slate-900")}>{it.label}</p>
              {!it.done && <p className="text-xs text-slate-500">{it.detail}</p>}
            </div>
            {!it.done && <Link href={it.href} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">Fix →</Link>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function SupplierOverview() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const role = companyRoleOf(user);
  const state = useAsync(() => api.supplierDashboard(30), []);
  const branches = useAsync(() => api.branches(), []);

  if (state.loading) return <LoadingBlock className="min-h-[50vh]" />;
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? "Could not load the dashboard"}</Alert>;
  const d = state.data;
  const k = d.kpis;
  const c = d.company;
  const money = (v: number) => formatSar(v, lang);
  const hasBranch = (branches.data?.length ?? 0) > 0;
  const needsSetup = c.verificationStatus !== "VERIFIED" || !c.logoUrl || k.listings < 5 || (!branches.loading && !branches.error && !hasBranch);

  const statusRows = STATUS_ORDER.map((s) => ({ label: s.replace("_", " "), value: d.ordersByStatus?.[s] ?? 0, color: STATUS_COLOR[s] }));

  const topColumns: Column<SupplierDashboard["topProducts"][number]>[] = [
    { key: "product", header: "Product", render: (r) => (
      <div>
        <p className="font-medium text-slate-900"><Link href={`/shop/products/${r.material.id}`} className="hover:text-brand-700">{lang === "ar" ? r.material.nameAr || r.material.name : r.material.name}</Link></p>
        <p className="text-xs text-slate-500">{r.material.sku} · per {r.material.unit}</p>
      </div>
    ) },
    { key: "qty", header: "Qty sold", align: "end", render: (r) => <span className="tabular-nums">{formatNumber(r.quantity, lang)}</span> },
    { key: "orders", header: "Orders", align: "end", render: (r) => <span className="tabular-nums">{r.orders}</span> },
    { key: "revenue", header: "Revenue", align: "end", render: (r) => <span className="font-semibold tabular-nums">{money(r.revenue)}</span> },
  ];

  const compColumns: Column<SupplierDashboard["priceCompetitiveness"][number]>[] = [
    { key: "material", header: "Material", render: (r) => (
      <div>
        <p className="font-medium text-slate-900">{lang === "ar" ? r.material.nameAr || r.material.name : r.material.name}</p>
        <p className="text-xs text-slate-500">{r.material.sku}</p>
      </div>
    ) },
    { key: "mine", header: "My price", align: "end", render: (r) => <span className="font-semibold tabular-nums">{money(r.myPrice)}</span> },
    { key: "avg", header: "Market avg", align: "end", render: (r) => <span className="tabular-nums text-slate-600">{money(r.marketAvg)}</span> },
    { key: "min", header: "Market min", align: "end", render: (r) => <span className="tabular-nums text-slate-600">{money(r.marketMin)}</span> },
    { key: "diff", header: "vs avg", align: "end", render: (r) => (
      <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", r.diffPct > 0 ? "bg-red-50 text-red-700" : r.diffPct < 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{formatPct(r.diffPct)}</span>
    ) },
    { key: "rank", header: "Rank", align: "end", render: (r) => (
      <span className="tabular-nums">
        <span className={cn("font-semibold", r.rank === 1 ? "text-emerald-700" : "text-slate-900")}>#{r.rank}</span>
        <span className="text-slate-400"> / {r.sellers}</span>
      </span>
    ) },
    { key: "edit", header: "", align: "end", render: () => <Link href="/supplier/prices" className="text-xs font-semibold text-brand-700 hover:underline">Edit price</Link> },
  ];

  const orderColumns: Column<OrderExtended>[] = [
    { key: "ref", header: "Reference", render: (o) => <Link href={`/supplier/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.reference}</Link> },
    { key: "type", header: "Type", render: (o) => <OrderTypeBadge order={o} /> },
    { key: "total", header: "Total", align: "end", render: (o) => <span className="font-semibold tabular-nums">{money(o.total)}</span> },
    { key: "payment", header: "Payment", render: (o) => <PaymentStatusBadge status={o.paymentStatus} /> },
    { key: "status", header: t("common.status"), render: (o) => <StatusBadge status={o.status} /> },
    { key: "created", header: "Created", render: (o) => <span className="text-slate-500">{formatDateTime(o.createdAt, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.city ? `Based in ${c.city}` : "Supplier account"}
            <VerificationBadge status={c.verificationStatus} />
            {c.slug && <Link href={`/suppliers/${c.slug}`} className="text-brand-700 hover:underline">View public page →</Link>}
          </span>
        }
        action={
          <>
            {canManageCompany(role) && <LinkButton href="/supplier/company" variant="outline">Edit storefront</LinkButton>}
            <LinkButton href="/supplier/marketplace" variant="accent">Browse open RFQs</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Revenue (30d)" value={`SAR ${formatCompact(k.revenue30d)}`} sub={`Lifetime ${money(k.revenueTotal)}`} tone="brand" spark={<Sparkline points={d.revenueByDay} color="#F2A900" width={90} height={28} />} />
        <Kpi label="Orders (30d)" value={formatNumber(k.orders30d, lang)} sub={`${k.pendingOrders} pending`} href="/supplier/orders" spark={<Sparkline points={d.ordersByDay} width={90} height={28} />} />
        <Kpi label="Pending orders" value={formatNumber(k.pendingOrders, lang)} sub="awaiting confirmation" href="/supplier/orders" tone={k.pendingOrders > 0 ? "amber" : "default"} />
        <Kpi label="Unpaid orders" value={formatNumber(k.unpaidOrders, lang)} sub="COD / bank transfer" href="/supplier/orders" />
        <Kpi label="Open RFQs in my cities" value={formatNumber(k.openRfqsInMyCities, lang)} sub="ready to bid" href="/supplier/marketplace" />
        <Kpi label="Win rate" value={`${Math.round(k.winRatePct)}%`} sub={`${k.bidsWon} won of ${k.bidsSubmitted} bids`} href="/supplier/bids" />
        <Kpi label="Low-stock items" value={formatNumber(k.lowStockItems, lang)} sub={`threshold ≤ ${c.lowStockThreshold}`} href="/supplier/inventory?lowStock=1" tone={k.lowStockItems > 0 ? "amber" : "default"} />
        <Kpi label="Unread messages" value={formatNumber(k.unreadMessages, lang)} sub="from buyers on orders" href="/supplier/orders" tone={k.unreadMessages > 0 ? "amber" : "default"} />
        <Kpi label="Rating" value={k.ratingCount ? k.rating.toFixed(1) : "—"} sub={<Stars value={k.rating} count={k.ratingCount} />} />
        <Kpi label="Product views (30d)" value={formatNumber(k.productViews30d, lang)} sub={`${k.listings} listings`} href="/supplier/prices" />
      </div>

      <div className={cn("mt-6 grid gap-6", needsSetup ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        <Card className={cn(needsSetup && "lg:col-span-1")}>
          <CardHeader title="Revenue" subtitle="Paid + delivered order value per day, last 30 days" />
          <CardBody><LineChart points={d.revenueByDay} lang={lang} format={money} label="Revenue by day" /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Orders" subtitle="New orders per day" />
          <CardBody><BarChart points={d.ordersByDay} lang={lang} format={(v) => formatNumber(v, lang)} label="Orders by day" /></CardBody>
        </Card>
        {needsSetup && <GettingStarted d={d} hasBranch={hasBranch} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Orders by status" />
          <CardBody><HorizontalBars rows={statusRows} /></CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Top products" subtitle="Best sellers in the last 30 days" action={<Link href="/supplier/inventory" className="text-sm font-semibold text-brand-700 hover:underline">{t("sup.inventory")} →</Link>} />
          <Table columns={topColumns} rows={d.topProducts ?? []} rowKey={(r) => r.material.id} dense empty={<EmptyState title="No sales yet" description="Publish prices to appear in the shop and receive direct orders." action={<LinkButton href="/supplier/imports" size="sm">Import price list</LinkButton>} />} />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Price competitiveness" subtitle="Your price against every other seller of the same material in the same city. Rank 1 is the cheapest." action={<Link href="/supplier/prices" className="text-sm font-semibold text-brand-700 hover:underline">{t("sup.prices")} →</Link>} />
        <Table columns={compColumns} rows={d.priceCompetitiveness ?? []} rowKey={(r) => r.listingId} dense empty={<EmptyState title="No comparable listings" description="Once other suppliers publish prices for the same materials you'll see where you stand." />} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent orders" action={<Link href="/supplier/orders" className="text-sm font-semibold text-brand-700 hover:underline">{t("common.viewAll")} →</Link>} />
          <Table columns={orderColumns} rows={(d.recentOrders ?? []).slice(0, 6)} rowKey={(o) => o.id} dense empty={<EmptyState title="No orders yet" description="Orders appear here after checkout or once a bid has been accepted." />} />
        </Card>
        <Card>
          <CardHeader title="Recent reviews" subtitle={k.ratingCount ? `${k.rating.toFixed(1)} average from ${k.ratingCount} reviews` : undefined} />
          {(d.recentReviews ?? []).length === 0 ? (
            <EmptyState title="No reviews yet" description="Buyers can rate you once an order is delivered." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.recentReviews.slice(0, 5).map((r: Review) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{r.comment || <span className="italic text-slate-400">No comment</span>}</p>
                  <p className="mt-1 text-xs text-slate-500">{r.buyer?.name}{r.buyer?.company ? ` · ${r.buyer.company.name}` : ""}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {r.reply ? <Badge tone="green">Replied</Badge> : <Link href={`/supplier/orders/${r.orderId}`} className="text-xs font-semibold text-brand-700 hover:underline">Reply →</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
