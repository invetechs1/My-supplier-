"use client";
import React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatNumber, formatSar } from "@/lib/format";
import { Alert, Card, CardHeader, LinkButton, LoadingBlock, PriceChange } from "@/components/ui";
import { ProductRail } from "@/components/shop/ProductCard";

export default function LandingPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");

  const stats = useAsync(() => api.stats(), []);
  const index = useAsync(() => api.priceIndex(), []);
  const categories = useAsync(() => api.categories(), []);
  const shop = useAsync(() => api.shopHome(), []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/materials?q=${encodeURIComponent(q.trim())}` : "/materials");
  };

  const statItems = stats.data
    ? [
        { label: t("stats.materials"), value: formatNumber(stats.data.materials, lang) },
        { label: t("stats.suppliers"), value: formatNumber(stats.data.suppliers, lang) },
        { label: t("stats.listings"), value: formatNumber(stats.data.priceListings, lang) },
        { label: t("stats.openRfqs"), value: formatNumber(stats.data.openRfqs, lang) },
        { label: t("stats.bids"), value: formatNumber(stats.data.bids, lang) },
        { label: t("stats.gmv"), value: `SAR ${formatCompact(stats.data.gmv)}` },
      ]
    : [];

  const steps = [
    { title: "Search prices", body: "Find live prices for thousands of materials from verified suppliers in every major city." },
    { title: "Request quotes", body: "Build an RFQ with your bill of quantities and delivery details in minutes." },
    { title: "Suppliers bid", body: "Suppliers in your region compete with itemised bids, lead times and validity." },
    { title: "Award & order", body: "Accept the best bid, track order status and keep everything in one place." },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-700 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden>
          <div className="absolute -top-24 -end-24 h-96 w-96 rounded-full bg-amber-500 blur-3xl" />
          <div className="absolute -bottom-32 -start-24 h-96 w-96 rounded-full bg-brand-300 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-50 ring-1 ring-inset ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Live market data · Saudi Arabia
            </span>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t("hero.kicker")}</p>
            <h1 className="mt-3 text-5xl font-bold leading-tight tracking-tight sm:text-6xl">{t("hero.title")}</h1>
            <p className="mt-5 max-w-2xl text-lg text-brand-100">{t("hero.subtitle")}</p>
            <form onSubmit={onSearch} className="mt-8 flex flex-col gap-2 sm:flex-row" role="search">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("hero.searchPlaceholder")}
                className="h-12 flex-1 rounded-xl border-0 bg-white px-4 text-slate-900 shadow-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                aria-label="Search materials"
              />
              <button type="submit" className="h-12 rounded-xl bg-amber-500 px-6 font-semibold text-slate-900 shadow-lg hover:bg-amber-600">
                {t("hero.search")}
              </button>
              <Link href="/shop" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 font-semibold text-white backdrop-blur hover:bg-white/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                {t("shop.shopLivePrices")}
              </Link>
            </form>
            <Link
              href="/boq"
              className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-amber-400/40 bg-white/10 px-5 py-4 backdrop-blur transition hover:bg-white/15"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-900">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7.5 3.75h9A1.5 1.5 0 0118 5.25v13.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 18.75V5.25a1.5 1.5 0 011.5-1.5zM9 8h6" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold text-white">Have a BOQ? Paste it and get every supplier&apos;s price in seconds.</p>
                  <p className="text-sm text-brand-100">No sign-up needed. Cheapest total, best single supplier and where to buy each line.</p>
                </div>
              </div>
              <span className="hidden shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 sm:block">Price my BOQ →</span>
            </Link>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-brand-100">
              <span>Popular:</span>
              {["Cement", "Rebar", "Concrete blocks", "Aggregate", "Ceramic tiles"].map((s) => (
                <Link key={s} href={`/materials?q=${encodeURIComponent(s)}`} className="rounded-full bg-white/10 px-2.5 py-0.5 hover:bg-white/20">
                  {s}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Today's deals */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
                <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-slate-900">%</span>
                {t("shop.deals")}
              </h2>
              <p className="text-sm text-slate-500">Live offers priced under the market average — add to cart and check out in minutes.</p>
            </div>
            <Link href="/shop" className="text-sm font-semibold text-brand-700 hover:underline">
              {t("shop.shopLivePrices")} →
            </Link>
          </div>
          {shop.loading ? (
            <LoadingBlock className="py-6" />
          ) : shop.error ? (
            <Alert kind="warning" onRetry={shop.reload}>Deals unavailable: {shop.error}</Alert>
          ) : (
            <ProductRail products={shop.data?.deals ?? []} emptyText="No deals right now — browse the shop for live prices." />
          )}
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {stats.loading ? (
            <LoadingBlock className="py-4" />
          ) : stats.error ? (
            <Alert kind="warning" onRetry={stats.reload}>Live stats unavailable: {stats.error}</Alert>
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {statItems.map((s) => (
                <div key={s.label} className="text-center">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums text-brand-700">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* Price index */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Card>
          <CardHeader
            title={t("landing.priceIndex")}
            subtitle={t("landing.priceIndexSub")}
            action={
              <Link href="/materials" className="text-sm font-semibold text-brand-600 hover:underline">
                {t("common.viewAll")} →
              </Link>
            }
          />
          {index.loading ? (
            <LoadingBlock />
          ) : index.error ? (
            <div className="p-5"><Alert onRetry={index.reload}>{index.error}</Alert></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 text-start">Category</th>
                    <th className="px-5 py-3 text-end">Materials</th>
                    <th className="px-5 py-3 text-end">Average price</th>
                    <th className="px-5 py-3 text-end">30d change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(index.data ?? []).map((row) => (
                    <tr key={row.category.id} className="hover:bg-brand-50/40">
                      <td className="px-5 py-3">
                        <Link href={`/materials?categoryId=${row.category.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {lang === "ar" ? row.category.nameAr : row.category.name}
                        </Link>
                        <span className="ms-2 text-xs text-slate-400">{lang === "ar" ? row.category.name : row.category.nameAr}</span>
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums text-slate-600">{row.materialCount}</td>
                      <td className="px-5 py-3 text-end font-medium tabular-nums text-slate-900">{formatSar(row.avgPrice, lang)}</td>
                      <td className="px-5 py-3 text-end"><PriceChange value={row.changePct30d} /></td>
                    </tr>
                  ))}
                  {(index.data ?? []).length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No index data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">{t("landing.howItWorks")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-500">From price discovery to delivered order in four steps.</p>
          <p className="mx-auto mt-3 flex max-w-xl items-center justify-center gap-2 text-center text-sm font-medium text-violet-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI reads any price list: PDF, Excel, photos — suppliers and buyers upload, we match it to the catalogue.
          </p>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-xl border border-slate-200 bg-slate-50 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2 lg:px-8">
        <div className="rounded-2xl bg-brand-600 p-8 text-white shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">{t("landing.forBuyers")}</p>
          <h3 className="mt-2 text-2xl font-semibold">Stop overpaying for materials</h3>
          <p className="mt-2 text-brand-100">Compare prices across suppliers, send one RFQ and let the market compete for your project.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="/register?role=BUYER" variant="accent">Create buyer account</LinkButton>
            <LinkButton href="/materials" variant="ghost" className="text-white hover:bg-white/10">Browse prices</LinkButton>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t("landing.forSuppliers")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Win more contracts</h3>
          <p className="mt-2 text-slate-600">Publish your price list, get notified of RFQs in your city and bid in minutes.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="/register?role=SUPPLIER">Join as supplier</LinkButton>
            <LinkButton href="/suppliers" variant="outline">See suppliers</LinkButton>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{t("landing.categories")}</h2>
        {categories.loading ? (
          <LoadingBlock />
        ) : categories.error ? (
          <Alert className="mt-4" onRetry={categories.reload}>{categories.error}</Alert>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {(categories.data ?? []).map((c) => (
              <Link
                key={c.id}
                href={`/materials?categoryId=${c.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-lg text-brand-700">{c.icon ?? "▦"}</span>
                <p className="mt-3 font-medium text-slate-900 group-hover:text-brand-700">{lang === "ar" ? c.nameAr : c.name}</p>
                <p className="text-xs text-slate-500">{lang === "ar" ? c.name : c.nameAr}</p>
                {typeof c.materialCount === "number" && <p className="mt-2 text-xs text-slate-400">{c.materialCount} materials</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
