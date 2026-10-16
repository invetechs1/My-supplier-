"use client";

import Link from "next/link";
import type { OrderExtended, OrderStatus, Review, SupplierDashboard } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { canManageCompany, companyRoleOf, useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
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
const STATUS_LABEL_KEY: Record<OrderStatus, TranslationKey> = {
  PENDING: "sup.dash.status.PENDING",
  CONFIRMED: "sup.dash.status.CONFIRMED",
  IN_TRANSIT: "sup.dash.status.IN_TRANSIT",
  DELIVERED: "sup.dash.status.DELIVERED",
  CANCELLED: "sup.dash.status.CANCELLED",
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
  const { t } = useI18n();
  const c = d.company;
  const items = [
    { done: c.verificationStatus === "VERIFIED", label: t("sup.dash.gs.verify"), detail: c.verificationStatus === "UNDER_REVIEW" ? t("sup.dash.gs.verifyReviewing") : t("sup.dash.gs.verifyDetail"), href: "/supplier/documents" },
    { done: !!c.logoUrl, label: t("sup.dash.gs.logo"), detail: t("sup.dash.gs.logoDetail"), href: "/supplier/company" },
    { done: d.kpis.listings >= 5, label: t("sup.dash.gs.prices"), detail: `${d.kpis.listings} ${t("sup.dash.gs.publishedSoFar")} ${t("sup.dash.gs.importHint")}`, href: "/supplier/imports" },
    { done: (c.citiesServed?.length ?? 0) > 0, label: t("sup.dash.gs.cities"), detail: t("sup.dash.gs.citiesDetail"), href: "/supplier/company" },
    { done: hasBranch, label: t("sup.dash.gs.branch"), detail: t("sup.dash.gs.branchDetail"), href: "/supplier/branches" },
  ];
  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
      <CardHeader title={t("sup.dash.gs.title")} subtitle={t("sup.dash.gs.subtitle")} />
      <ul className="divide-y divide-amber-100">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-3 px-5 py-3">
            <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", it.done ? "bg-emerald-500 text-white" : "border-2 border-amber-400 bg-white text-transparent")}>✓</span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", it.done ? "text-slate-500 line-through" : "text-slate-900")}>{it.label}</p>
              {!it.done && <p className="text-xs text-slate-500">{it.detail}</p>}
            </div>
            {!it.done && <Link href={it.href} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">{t("sup.dash.gs.fix")}</Link>}
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
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? t("sup.dash.loadError")}</Alert>;
  const d = state.data;
  const k = d.kpis;
  const c = d.company;
  const money = (v: number) => formatSar(v, lang);
  const hasBranch = (branches.data?.length ?? 0) > 0;
  const needsSetup = c.verificationStatus !== "VERIFIED" || !c.logoUrl || k.listings < 5 || (!branches.loading && !branches.error && !hasBranch);

  const statusRows = STATUS_ORDER.map((s) => ({ label: t(STATUS_LABEL_KEY[s]), value: d.ordersByStatus?.[s] ?? 0, color: STATUS_COLOR[s] }));

  const topColumns: Column<SupplierDashboard["topProducts"][number]>[] = [
    { key: "product", header: t("sup.dash.col.product"), render: (r) => (
      <div>
        <p className="font-medium text-slate-900"><Link href={`/shop/products/${r.material.id}`} className="hover:text-brand-700">{lang === "ar" ? r.material.nameAr || r.material.name : r.material.name}</Link></p>
        <p className="text-xs text-slate-500">{r.material.sku} · {t("shop.per")} {r.material.unit}</p>
      </div>
    ) },
    { key: "qty", header: t("sup.dash.col.qtySold"), align: "end", render: (r) => <span className="tabular-nums">{formatNumber(r.quantity, lang)}</span> },
    { key: "orders", header: t("sup.orders"), align: "end", render: (r) => <span className="tabular-nums">{r.orders}</span> },
    { key: "revenue", header: t("sup.dash.revenue"), align: "end", render: (r) => <span className="font-semibold tabular-nums">{money(r.revenue)}</span> },
  ];

  const compColumns: Column<SupplierDashboard["priceCompetitiveness"][number]>[] = [
    { key: "material", header: t("sup.dash.col.material"), render: (r) => (
      <div>
        <p className="font-medium text-slate-900">{lang === "ar" ? r.material.nameAr || r.material.name : r.material.name}</p>
        <p className="text-xs text-slate-500">{r.material.sku}</p>
      </div>
    ) },
    { key: "mine", header: t("sup.dash.col.myPrice"), align: "end", render: (r) => <span className="font-semibold tabular-nums">{money(r.myPrice)}</span> },
    { key: "avg", header: t("sup.dash.col.marketAvg"), align: "end", render: (r) => <span className="tabular-nums text-slate-600">{money(r.marketAvg)}</span> },
    { key: "min", header: t("sup.dash.col.marketMin"), align: "end", render: (r) => <span className="tabular-nums text-slate-600">{money(r.marketMin)}</span> },
    { key: "diff", header: t("sup.dash.col.vsAvg"), align: "end", render: (r) => (
      <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", r.diffPct > 0 ? "bg-red-50 text-red-700" : r.diffPct < 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{formatPct(r.diffPct)}</span>
    ) },
    { key: "rank", header: t("sup.dash.col.rank"), align: "end", render: (r) => (
      <span className="tabular-nums">
        <span className={cn("font-semibold", r.rank === 1 ? "text-emerald-700" : "text-slate-900")}>#{r.rank}</span>
        <span className="text-slate-400"> / {r.sellers}</span>
      </span>
    ) },
    { key: "edit", header: "", align: "end", render: () => <Link href="/supplier/prices" className="text-xs font-semibold text-brand-700 hover:underline">{t("sup.dash.editPrice")}</Link> },
  ];

  const orderColumns: Column<OrderExtended>[] = [
    { key: "ref", header: t("checkout.reference"), render: (o) => <Link href={`/supplier/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.reference}</Link> },
    { key: "type", header: t("sup.dash.col.type"), render: (o) => <OrderTypeBadge order={o} /> },
    { key: "total", header: t("common.total"), align: "end", render: (o) => <span className="font-semibold tabular-nums">{money(o.total)}</span> },
    { key: "payment", header: t("sup.dash.col.payment"), render: (o) => <PaymentStatusBadge status={o.paymentStatus} /> },
    { key: "status", header: t("common.status"), render: (o) => <StatusBadge status={o.status} /> },
    { key: "created", header: t("sup.dash.col.created"), render: (o) => <span className="text-slate-500">{formatDateTime(o.createdAt, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.city ? `${t("sup.dash.basedIn")} ${c.city}` : t("sup.dash.supplierAccount")}
            <VerificationBadge status={c.verificationStatus} />
            {c.slug && <Link href={`/suppliers/${c.slug}`} className="text-brand-700 hover:underline">{t("sup.dash.viewPublicPage")}</Link>}
          </span>
        }
        action={
          <>
            {canManageCompany(role) && <LinkButton href="/supplier/company" variant="outline">{t("sup.dash.editStorefront")}</LinkButton>}
            <LinkButton href="/supplier/marketplace" variant="accent">{t("sup.dash.browseOpenRfqs")}</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label={t("sup.dash.kpi.revenue30d")} value={`SAR ${formatCompact(k.revenue30d)}`} sub={`${t("sup.dash.kpi.lifetime")} ${money(k.revenueTotal)}`} tone="brand" spark={<Sparkline points={d.revenueByDay} color="#F2A900" width={90} height={28} />} />
        <Kpi label={t("sup.dash.kpi.orders30d")} value={formatNumber(k.orders30d, lang)} sub={`${k.pendingOrders} ${t("sup.dash.kpi.pendingWord")}`} href="/supplier/orders" spark={<Sparkline points={d.ordersByDay} width={90} height={28} />} />
        <Kpi label={t("sup.dash.kpi.pendingOrders")} value={formatNumber(k.pendingOrders, lang)} sub={t("sup.dash.kpi.awaitingConfirmation")} href="/supplier/orders" tone={k.pendingOrders > 0 ? "amber" : "default"} />
        <Kpi label={t("sup.dash.kpi.unpaidOrders")} value={formatNumber(k.unpaidOrders, lang)} sub={t("sup.dash.kpi.codBank")} href="/supplier/orders" />
        <Kpi label={t("sup.dash.kpi.openRfqs")} value={formatNumber(k.openRfqsInMyCities, lang)} sub={t("sup.dash.kpi.readyToBid")} href="/supplier/marketplace" />
        <Kpi label={t("sup.dash.kpi.winRate")} value={`${Math.round(k.winRatePct)}%`} sub={`${k.bidsWon} ${t("sup.dash.kpi.wonOf")} ${k.bidsSubmitted} ${t("sup.dash.kpi.bids")}`} href="/supplier/bids" />
        <Kpi label={t("sup.dash.kpi.lowStock")} value={formatNumber(k.lowStockItems, lang)} sub={`${t("sup.dash.kpi.threshold")} ${c.lowStockThreshold}`} href="/supplier/inventory?lowStock=1" tone={k.lowStockItems > 0 ? "amber" : "default"} />
        <Kpi label={t("sup.dash.kpi.unreadMessages")} value={formatNumber(k.unreadMessages, lang)} sub={t("sup.dash.kpi.fromBuyers")} href="/supplier/orders" tone={k.unreadMessages > 0 ? "amber" : "default"} />
        <Kpi label={t("sup.dash.kpi.rating")} value={k.ratingCount ? k.rating.toFixed(1) : "—"} sub={<Stars value={k.rating} count={k.ratingCount} />} />
        <Kpi label={t("sup.dash.kpi.productViews")} value={formatNumber(k.productViews30d, lang)} sub={`${k.listings} ${t("sup.dash.kpi.listings")}`} href="/supplier/prices" />
      </div>

      <div className={cn("mt-6 grid gap-6", needsSetup ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        <Card className={cn(needsSetup && "lg:col-span-1")}>
          <CardHeader title={t("sup.dash.revenue")} subtitle={t("sup.dash.revenueSubtitle")} />
          <CardBody><LineChart points={d.revenueByDay} lang={lang} format={money} label={t("sup.dash.revenueByDay")} /></CardBody>
        </Card>
        <Card>
          <CardHeader title={t("sup.orders")} subtitle={t("sup.dash.ordersSubtitle")} />
          <CardBody><BarChart points={d.ordersByDay} lang={lang} format={(v) => formatNumber(v, lang)} label={t("sup.dash.ordersByDay")} /></CardBody>
        </Card>
        {needsSetup && <GettingStarted d={d} hasBranch={hasBranch} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("sup.dash.ordersByStatus")} />
          <CardBody><HorizontalBars rows={statusRows} /></CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("sup.dash.topProducts")} subtitle={t("sup.dash.topProductsSubtitle")} action={<Link href="/supplier/inventory" className="text-sm font-semibold text-brand-700 hover:underline">{t("sup.inventory")} →</Link>} />
          <Table columns={topColumns} rows={d.topProducts ?? []} rowKey={(r) => r.material.id} dense empty={<EmptyState title={t("sup.dash.noSales")} description={t("sup.dash.noSalesDesc")} action={<LinkButton href="/supplier/imports" size="sm">{t("sup.imports")}</LinkButton>} />} />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={t("sup.dash.priceComp")} subtitle={t("sup.dash.priceCompSubtitle")} action={<Link href="/supplier/prices" className="text-sm font-semibold text-brand-700 hover:underline">{t("sup.prices")} →</Link>} />
        <Table columns={compColumns} rows={d.priceCompetitiveness ?? []} rowKey={(r) => r.listingId} dense empty={<EmptyState title={t("sup.dash.noComparable")} description={t("sup.dash.noComparableDesc")} />} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("sup.dash.recentOrders")} action={<Link href="/supplier/orders" className="text-sm font-semibold text-brand-700 hover:underline">{t("common.viewAll")} →</Link>} />
          <Table columns={orderColumns} rows={(d.recentOrders ?? []).slice(0, 6)} rowKey={(o) => o.id} dense empty={<EmptyState title={t("sup.dash.noOrders")} description={t("sup.dash.noOrdersDesc")} />} />
        </Card>
        <Card>
          <CardHeader title={t("sup.dash.recentReviews")} subtitle={k.ratingCount ? `${k.rating.toFixed(1)} ${t("sup.dash.averageFrom")} ${k.ratingCount} ${t("reviews.many")}` : undefined} />
          {(d.recentReviews ?? []).length === 0 ? (
            <EmptyState title={t("reviews.none")} description={t("sup.dash.noReviewsDesc")} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.recentReviews.slice(0, 5).map((r: Review) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{r.comment || <span className="italic text-slate-400">{t("sup.dash.noComment")}</span>}</p>
                  <p className="mt-1 text-xs text-slate-500">{r.buyer?.name}{r.buyer?.company ? ` · ${r.buyer.company.name}` : ""}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {r.reply ? <Badge tone="green">{t("sup.dash.replied")}</Badge> : <Link href={`/supplier/orders/${r.orderId}`} className="text-xs font-semibold text-brand-700 hover:underline">{t("sup.dash.reply")}</Link>}
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
