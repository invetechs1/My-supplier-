"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Category } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/format";
import { Alert, Card, EmptyState, LinkButton, LoadingBlock } from "@/components/ui";
import { ProductCard, ProductRail, SectionHeading } from "@/components/shop/ProductCard";

interface Banner {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  className: string;
}

const BANNERS: Banner[] = [
  {
    key: "live",
    eyebrow: "Live market",
    title: "Live prices from every supplier",
    body: "Cement, rebar, blocks, aggregates and more — compare real offers side by side and order in one checkout.",
    cta: "Browse all products",
    href: "/shop/products",
    className: "bg-brand-700 text-white",
  },
  {
    key: "deals",
    eyebrow: "Today's deals",
    title: "Deals under market average",
    body: "Offers priced at least 5% below the average of all suppliers, refreshed as prices change.",
    cta: "See deals",
    href: "#deals",
    className: "bg-amber-500 text-slate-900",
  },
  {
    key: "sell",
    eyebrow: "For suppliers",
    title: "Sell on MySupplier",
    body: "Publish your catalogue with stock and prices in minutes and reach contractors across the Kingdom.",
    cta: "Start selling",
    href: "/supplier/catalog",
    className: "bg-slate-900 text-white",
  },
];

function BannerStrip() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setActive((i) => (i + 1) % BANNERS.length), 6000);
    return () => clearInterval(timer);
  }, []);
  const b = BANNERS[active];
  return (
    <section aria-label="Highlights">
      <div className={cn("relative overflow-hidden rounded-2xl px-6 py-10 shadow-card transition-colors sm:px-10 sm:py-14", b.className)}>
        <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{b.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{b.title}</h1>
          <p className="mt-3 text-base opacity-90">{b.body}</p>
          <Link
            href={b.href}
            className={cn(
              "mt-6 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold shadow-sm transition",
              b.key === "deals" ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-white text-slate-900 hover:bg-slate-100",
            )}
          >
            {b.cta} →
          </Link>
        </div>
        <div className="relative mt-6 flex gap-2" role="tablist" aria-label="Banners">
          {BANNERS.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={x.title}
              onClick={() => setActive(i)}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "w-8 bg-current opacity-90" : "w-4 bg-current opacity-40 hover:opacity-70")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryRail({ categories, lang }: { categories: Category[]; lang: "en" | "ar" }) {
  const roots = categories.filter((c) => !c.parentId);
  const list = roots.length > 0 ? roots : categories;
  if (list.length === 0) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-3">
        {list.map((c) => (
          <Link
            key={c.id}
            href={`/shop/products?categoryId=${encodeURIComponent(c.id)}`}
            className="group flex w-[128px] shrink-0 flex-col items-center rounded-xl border border-slate-200 bg-white px-3 py-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl text-brand-700">{c.icon ?? "▦"}</span>
            <span className="mt-2 line-clamp-2 text-xs font-semibold text-slate-900 group-hover:text-brand-700">{lang === "ar" ? c.nameAr : c.name}</span>
            {typeof c.materialCount === "number" && <span className="mt-0.5 text-[11px] text-slate-400">{c.materialCount}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

const TRUST = [
  { title: "Verified suppliers", body: "CR and VAT checked before the badge is shown." },
  { title: "Live prices", body: "Offers update as suppliers change their lists." },
  { title: "VAT invoice", body: "15% VAT itemised on every order." },
  { title: "Delivery across KSA", body: "Per-supplier delivery to any major city." },
];

export default function ShopHomePage() {
  const { t, lang } = useI18n();
  usePageTitle(t("shop.title"));
  const home = useAsync(() => api.shopHome(), []);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-8 sm:px-6 lg:px-8">
      <BannerStrip />

      {home.loading ? (
        <LoadingBlock className="min-h-[40vh]" />
      ) : home.error || !home.data ? (
        <Alert onRetry={home.reload}>{home.error ?? "Storefront unavailable"}</Alert>
      ) : (
        <>
          <section aria-labelledby="shop-categories">
            <SectionHeading title={<span id="shop-categories">{t("shop.categories")}</span>} href="/shop/products" linkLabel={t("shop.allProducts")} />
            <CategoryRail categories={home.data.categories ?? []} lang={lang} />
          </section>

          <section id="deals" aria-labelledby="shop-deals" className="scroll-mt-24">
            <SectionHeading
              title={
                <span id="shop-deals" className="inline-flex items-center gap-2">
                  <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-slate-900">%</span>
                  {t("shop.deals")}
                </span>
              }
              subtitle="Best price at least 5% under the market average"
              href="/shop/products?sort=popular"
            />
            <ProductRail products={home.data.deals ?? []} emptyText="No deals right now — check back soon." />
          </section>

          <section aria-labelledby="shop-featured">
            <SectionHeading title={<span id="shop-featured">{t("shop.featured")}</span>} href="/shop/products" />
            {(home.data.featured ?? []).length === 0 ? (
              <Card>
                <EmptyState title="No featured products yet" action={<LinkButton href="/shop/products">{t("shop.allProducts")}</LinkButton>} />
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {home.data.featured.slice(0, 10).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="shop-new">
            <SectionHeading title={<span id="shop-new">{t("shop.newArrivals")}</span>} href="/shop/products?sort=newest" />
            <ProductRail products={home.data.newArrivals ?? []} emptyText="No new products this week." />
          </section>

          <section aria-label="Why MySupplier" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
            {home.data.stats && (
              <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                {formatNumber(home.data.stats.materials, lang)} products · {formatNumber(home.data.stats.suppliers, lang)} suppliers · {formatNumber(home.data.stats.priceListings, lang)} live offers
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
