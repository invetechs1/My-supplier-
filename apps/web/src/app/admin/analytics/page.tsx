"use client";

import React, { useState } from "react";
import { request } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/format";
import { Alert, Card, CardBody, CardHeader, EmptyState, LoadingBlock, PageHeader, Select, StatTile, Table, type Column } from "@/components/ui";

interface Step { step: string; label: string; sessions: number; fromPrevPct: number | null; fromTopPct: number | null }
interface Funnel {
  days: number;
  totals: { visits: number; visitsPrev: number; orders: number; ordersPrev: number; boqs: number; rfqs: number; signups: { buyer: number; supplier: number }; overallShopPct: number };
  shop: Step[];
  procurement: Step[];
  weekly: ({ week: string } & Record<string, number | string>)[];
  topSearches: { q: string; count: number; zeroResults: number }[];
  topPages: { path: string; views: number }[];
  byCity: { city: string; events: number }[];
  byRole: Record<string, number>;
}

function delta(now: number, prev: number): { text: string; tone: "default" | "brand" | "amber" } {
  if (!prev) return { text: now ? "new" : "no data yet", tone: "default" };
  const pct = Math.round(((now - prev) / prev) * 100);
  return { text: `${pct >= 0 ? "+" : ""}${pct}% vs previous period`, tone: pct >= 0 ? "brand" : "amber" };
}

function FunnelBars({ steps, title, subtitle }: { steps: Step[]; title: string; subtitle: string }) {
  const top = steps[0]?.sessions ?? 0;
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody className="space-y-3">
        {steps.map((s, i) => {
          const width = top ? Math.max(2, Math.round((s.sessions / top) * 100)) : 0;
          const weakest = i > 0 && s.fromPrevPct !== null && s.fromPrevPct === Math.min(...steps.slice(1).map((x) => x.fromPrevPct ?? 100));
          return (
            <div key={s.step}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-800">{i + 1}. {s.label}</span>
                <span className="tabular-nums text-slate-600">{formatNumber(s.sessions)}{s.fromPrevPct !== null && <span className={cn("ms-2 text-xs", weakest ? "font-semibold text-amber-700" : "text-slate-500")}>{s.fromPrevPct}% of previous{weakest ? " · biggest drop" : ""}</span>}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", i === steps.length - 1 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${width}%` }} /></div>
            </div>
          );
        })}
        {!top && <p className="text-sm text-slate-500">No sessions recorded yet. Events arrive once visitors accept analytics in the cookie banner; conversions (orders, RFQs, BOQs) are recorded by the server regardless.</p>}
      </CardBody>
    </Card>
  );
}

export default function AdminAnalyticsPage() {
  const { t, lang } = useI18n();
  const [days, setDays] = useState("30");
  const state = useAsync(() => request<Funnel>("/admin/analytics/funnel", { query: { days: Number(days) } }), [days]);
  const d = state.data;
  const weekCols: Column<Funnel["weekly"][number]>[] = [
    { key: "week", header: "Week of", render: (r) => <span className="font-mono text-xs">{r.week}</span> },
    { key: "page_view", header: "Visits", align: "end", render: (r) => formatNumber(Number(r.page_view ?? 0), lang) },
    { key: "product_view", header: "Product views", align: "end", render: (r) => formatNumber(Number(r.product_view ?? 0), lang) },
    { key: "add_to_cart", header: "Add to cart", align: "end", render: (r) => formatNumber(Number(r.add_to_cart ?? 0), lang) },
    { key: "order_created", header: "Orders", align: "end", render: (r) => <span className="font-semibold">{formatNumber(Number(r.order_created ?? 0), lang)}</span> },
    { key: "boq_analyzed", header: "BOQs", align: "end", render: (r) => formatNumber(Number(r.boq_analyzed ?? 0), lang) },
    { key: "rfq_created", header: "RFQs", align: "end", render: (r) => formatNumber(Number(r.rfq_created ?? 0), lang) },
  ];
  return (
    <div>
      <PageHeader title={t("admin.analytics")} subtitle="Where buyers come in and where they drop out. Visits, searches, product views, cart and checkout are consent-based browser events; orders, RFQs, BOQs and sign-ups are recorded by the server." action={<Select name="days" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} className="w-40" />} />
      {state.loading && !d ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : d ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Visits (sessions)" value={formatNumber(d.totals.visits, lang)} sub={delta(d.totals.visits, d.totals.visitsPrev).text} tone={delta(d.totals.visits, d.totals.visitsPrev).tone} />
            <StatTile label="Orders" value={formatNumber(d.totals.orders, lang)} sub={`${delta(d.totals.orders, d.totals.ordersPrev).text} · ${d.totals.overallShopPct}% of visits`} tone="brand" />
            <StatTile label="BOQs analysed → RFQs" value={`${formatNumber(d.totals.boqs, lang)} → ${formatNumber(d.totals.rfqs, lang)}`} sub={d.totals.boqs ? `${Math.round((d.totals.rfqs / d.totals.boqs) * 100)}% of BOQs became an RFQ` : "No BOQ activity yet"} />
            <StatTile label="Sign-ups" value={`${d.totals.signups.buyer} buyers · ${d.totals.signups.supplier} suppliers`} sub={Object.entries(d.byRole).map(([r, n]) => `${r} ${n}`).join(" · ") || "Visits by role appear here"} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <FunnelBars steps={d.shop} title="Shop funnel" subtitle="Sessions that reached each step; the amber bar is the money step. The biggest drop is where to focus." />
            <FunnelBars steps={d.procurement} title="BOQ → RFQ funnel" subtitle="The contractor path: pricing a bill of quantities, publishing an RFQ, receiving bids." />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Card>
              <CardHeader title="Top searches" subtitle="Zero-result searches also feed Demand & gaps." />
              {d.topSearches.length ? <ul className="divide-y divide-slate-100">{d.topSearches.map((s) => <li key={s.q} className="flex items-center justify-between px-5 py-2 text-sm"><span className="truncate">{s.q}</span><span className="tabular-nums text-slate-600">{s.count}{s.zeroResults ? <span className="ms-2 text-xs text-red-600">{s.zeroResults} × 0 results</span> : null}</span></li>)}</ul> : <CardBody><EmptyState title="No searches yet" /></CardBody>}
            </Card>
            <Card>
              <CardHeader title="Top pages" />
              {d.topPages.length ? <ul className="divide-y divide-slate-100">{d.topPages.map((p) => <li key={p.path} className="flex items-center justify-between px-5 py-2 text-sm"><span className="truncate font-mono text-xs" dir="ltr">{p.path}</span><span className="tabular-nums text-slate-600">{formatNumber(p.views, lang)}</span></li>)}</ul> : <CardBody><EmptyState title="No page views yet" /></CardBody>}
            </Card>
            <Card>
              <CardHeader title="Activity by city" subtitle="Searches, product views, BOQs, RFQs and orders with a city." />
              {d.byCity.length ? <ul className="divide-y divide-slate-100">{d.byCity.map((c) => <li key={c.city} className="flex items-center justify-between px-5 py-2 text-sm"><span>{c.city}</span><span className="tabular-nums text-slate-600">{formatNumber(c.events, lang)}</span></li>)}</ul> : <CardBody><EmptyState title="No city data yet" /></CardBody>}
            </Card>
          </div>
          <Card>
            <CardHeader title="Week by week" />
            <Table columns={weekCols} rows={d.weekly} rowKey={(r) => r.week} empty={<EmptyState title="No weekly data yet" />} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
