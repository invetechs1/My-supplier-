"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Material, ShopOffer } from "@mysupplier/shared";
import { api, type MaterialWithLogistics } from "@/lib/api";
import { clampQty, isPurchasable, minQtyFor, useCart } from "@/lib/cart";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, SourceBadge, Table, VerifiedBadge, type Column } from "@/components/ui";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { ProductImage, ProductRail, SectionHeading, StockPill, dealPercent } from "@/components/shop/ProductCard";

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, rating));
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${r.toFixed(1)} out of 5`} title={`${r.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" fill="currentColor" className={i <= Math.round(r) ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-slate-300"} aria-hidden>
          <path d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" />
        </svg>
      ))}
      <span className="ms-1 text-xs text-slate-500">{r.toFixed(1)}</span>
    </span>
  );
}

function OfferAddButton({ offer, product, size = "sm" }: { offer: ShopOffer; product: Material; size?: "sm" | "md" | "lg" }) {
  const { t } = useI18n();
  const { add, busy } = useCart();
  const [adding, setAdding] = useState(false);
  const purchasable = isPurchasable(offer);
  return (
    <Button
      size={size}
      variant={purchasable ? "outline" : "ghost"}
      disabled={!purchasable || busy}
      loading={adding}
      title={purchasable ? undefined : "Reference price — not purchasable"}
      onClick={async () => {
        setAdding(true);
        try {
          await add(offer.listingId, minQtyFor(offer), { offer, material: product });
        } finally {
          setAdding(false);
        }
      }}
    >
      {purchasable ? t("shop.addToCart") : "Reference"}
    </Button>
  );
}

export default function ShopProductPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { t, lang } = useI18n();
  const { add, busy } = useCart();
  const state = useAsync(() => api.shopProduct(id), [id]);

  const p = state.data;
  const offers = p?.offers ?? [];
  const best: ShopOffer | null = p?.bestOffer ?? offers.find((o) => isPurchasable(o)) ?? offers[0] ?? null;
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  useEffect(() => {
    setQty(minQtyFor(best));
  }, [best?.listingId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading) return <LoadingBlock className="min-h-[50vh]" />;
  if (state.error || !p)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert onRetry={state.reload}>{state.error ?? "Product not found"}</Alert>
      </div>
    );

  const name = lang === "ar" ? p.nameAr || p.name : p.name;
  const altName = lang === "ar" ? p.name : p.nameAr;
  const pct = dealPercent(p);
  const purchasable = isPurchasable(best);
  const others = offers.filter((o) => o.listingId !== best?.listingId);
  const stockCap = best && typeof best.stock === "number" ? best.stock : null;
  const lineTotal = best ? best.price * qty : 0;

  const doAdd = async (mode: "add" | "buy") => {
    if (!best || !purchasable) return;
    setPending(mode);
    try {
      const ok = await add(best.listingId, clampQty(best, qty), { offer: best, material: p });
      if (ok && mode === "buy") router.push("/cart");
    } finally {
      setPending(null);
    }
  };

  const offerColumns: Column<ShopOffer>[] = [
    {
      key: "supplier",
      header: "Supplier",
      render: (o) => (
        <div className="flex flex-wrap items-center gap-2">
          {o.companyId ? (
            <Link href={`/suppliers/${o.companyId}`} className="font-medium text-slate-900 hover:text-brand-700">
              {o.companyName}
            </Link>
          ) : (
            <span className="font-medium text-slate-700">{o.sourceName ?? o.companyName ?? "Market"}</span>
          )}
          <VerifiedBadge verified={o.verified} />
          {o.rating > 0 && <Stars rating={o.rating} />}
        </div>
      ),
    },
    { key: "city", header: t("common.city"), render: (o) => o.city },
    { key: "price", header: `Price / ${p.unit}`, align: "end", render: (o) => <span className="font-semibold tabular-nums text-slate-900">{formatSar(o.price, lang)}</span> },
    { key: "minQty", header: "Min qty", align: "end", render: (o) => `${o.minQty} ${p.unit}` },
    { key: "lead", header: "Lead time", align: "end", render: (o) => `${o.leadTimeDays} d` },
    { key: "stock", header: "Stock", render: (o) => <StockPill offer={o} /> },
    { key: "source", header: "Source", render: (o) => <SourceBadge source={o.source} /> },
    { key: "action", header: "", align: "end", render: (o) => <OfferAddButton offer={o} product={p} /> },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:text-brand-700">
          {t("nav.shop")}
        </Link>
        <span className="mx-2">/</span>
        <Link href="/shop/products" className="hover:text-brand-700">
          {t("shop.allProducts")}
        </Link>
        {p.category && (
          <>
            <span className="mx-2">/</span>
            <Link href={`/shop/products?categoryId=${p.category.id}`} className="hover:text-brand-700">
              {lang === "ar" ? p.category.nameAr : p.category.name}
            </Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span className="text-slate-700">{name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)]">
        {/* Image */}
        <Card className="relative aspect-square overflow-hidden bg-slate-50 p-6">
          <ProductImage material={p} />
          <div className="absolute start-3 top-3 flex gap-2">
            {(p.isDeal || pct !== null) && (
              <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-slate-900 shadow-sm">
                {t("shop.deal")}
                {pct !== null ? ` −${pct}%` : ""}
              </span>
            )}
          </div>
        </Card>

        {/* Info */}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{name}</h1>
          {altName && <p className="mt-1 text-lg text-slate-500">{altName}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {p.brand && <Badge tone="blue">{p.brand}</Badge>}
            <Badge tone="slate">SKU {p.sku}</Badge>
            <Badge tone="slate">Unit: {p.unit}</Badge>
            {p.category && <Badge tone="slate">{lang === "ar" ? p.category.nameAr : p.category.name}</Badge>}
            {(p as MaterialWithLogistics).hazardous && <Badge tone="red">Hazardous</Badge>}
          </div>
          {(() => {
            const l = p as MaterialWithLogistics;
            if (!l.weightKg && !l.volumeM3) return null;
            return (
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {l.weightKg ? <div><dt className="inline text-slate-500">Weight per unit: </dt><dd className="inline font-medium tabular-nums text-slate-900">{l.weightKg} kg / {p.unit}</dd></div> : null}
                {l.volumeM3 ? <div><dt className="inline text-slate-500">Volume per unit: </dt><dd className="inline font-medium tabular-nums text-slate-900">{l.volumeM3} m³ / {p.unit}</dd></div> : null}
              </dl>
            );
          })()}
          {p.description && <p className="mt-4 text-sm leading-relaxed text-slate-600">{p.description}</p>}

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{t("price.lowest")}</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-700">{formatSar(p.summary?.min ?? p.minPrice, lang)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{t("price.average")}</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">{formatSar(p.summary?.avg ?? p.avgPrice, lang)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{t("price.highest")}</p>
              <p className="text-sm font-semibold tabular-nums text-slate-700">{formatSar(p.summary?.max ?? p.maxPrice, lang)}</p>
            </div>
          </div>

          {p.specs && Object.keys(p.specs).length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Specifications" />
              <dl className="divide-y divide-slate-100 text-sm">
                {Object.entries(p.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-5 py-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium text-slate-900">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          <p className="mt-6 text-sm text-slate-500">
            Need a large quantity or a project price?{" "}
            <Link href={`/dashboard/rfqs/new?materialId=${p.id}`} className="font-semibold text-brand-700 hover:underline">
              Request quotes instead →
            </Link>
          </p>
        </div>

        {/* Buy box */}
        <Card className="h-fit p-5 lg:sticky lg:top-24">
          {best ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Best offer</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-brand-700">{formatSar(best.price, lang)}</span>
                <span className="text-sm text-slate-500">/ {p.unit}</span>
              </div>
              <p className="text-xs text-slate-500">Excl. 15% VAT · VAT invoice issued at checkout</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Sold by</dt>
                  <dd className="flex items-center gap-1.5 text-end font-medium text-slate-900">
                    {best.companyId ? (
                      <Link href={`/suppliers/${best.companyId}`} className="hover:text-brand-700">
                        {best.companyName}
                      </Link>
                    ) : (
                      best.sourceName ?? best.companyName
                    )}
                    <VerifiedBadge verified={best.verified} />
                  </dd>
                </div>
                {best.rating > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Rating</dt>
                    <dd>
                      <Stars rating={best.rating} />
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Ships from</dt>
                  <dd className="font-medium text-slate-900">{best.city}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Lead time</dt>
                  <dd className="font-medium text-slate-900">{best.leadTimeDays} days</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Availability</dt>
                  <dd>
                    <StockPill offer={best} />
                    {typeof best.stock === "number" && <span className="ms-1 text-xs text-slate-500">({best.stock})</span>}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Min order</dt>
                  <dd className="font-medium text-slate-900">
                    {best.minQty} {p.unit}
                  </dd>
                </div>
              </dl>

              {purchasable ? (
                <>
                  <div className="mt-5">
                    <label htmlFor="qty" className="mb-1 block text-sm font-medium text-slate-700">
                      Quantity ({p.unit})
                    </label>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" aria-label="Decrease" disabled={qty <= minQtyFor(best)} onClick={() => setQty((v) => clampQty(best, v - 1))}>
                        −
                      </Button>
                      <input
                        id="qty"
                        type="number"
                        inputMode="numeric"
                        min={minQtyFor(best)}
                        max={stockCap ?? undefined}
                        value={qty}
                        onChange={(e) => setQty(Number(e.target.value) || minQtyFor(best))}
                        onBlur={() => setQty((v) => clampQty(best, v))}
                        className="h-9 w-24 rounded-lg border border-slate-300 px-2 text-center text-sm tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                        dir="ltr"
                      />
                      <Button type="button" variant="outline" size="sm" aria-label="Increase" disabled={stockCap !== null && qty >= stockCap} onClick={() => setQty((v) => clampQty(best, v + 1))}>
                        +
                      </Button>
                    </div>
                    {best.minQty > 1 && <p className="mt-1 text-xs text-slate-500">Minimum {best.minQty} {p.unit}</p>}
                  </div>
                  <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3 text-sm">
                    <span className="text-slate-500">Line total</span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900">{formatSar(lineTotal, lang)}</span>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <Button variant="accent" size="lg" onClick={() => doAdd("add")} loading={pending === "add"} disabled={busy && pending !== "add"}>
                      {t("shop.addToCart")}
                    </Button>
                    <Button size="lg" onClick={() => doAdd("buy")} loading={pending === "buy"} disabled={busy && pending !== "buy"}>
                      {t("shop.buyNow")}
                    </Button>
                  </div>
                </>
              ) : (
                <Alert kind="info" className="mt-5">
                  This is a market reference price and cannot be ordered directly. Choose a supplier offer below or request quotes.
                </Alert>
              )}
            </>
          ) : (
            <EmptyState title="No offers yet" description="No supplier has listed this product. Request quotes to get prices." action={<Link href={`/dashboard/rfqs/new?materialId=${p.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Request quotes →</Link>} />
          )}
        </Card>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`${t("shop.otherSellers")} (${others.length})`} subtitle="All offers sorted by price. Market rows are reference prices only." />
          <Table columns={offerColumns} rows={others} rowKey={(o) => o.listingId} empty={<EmptyState title="No other sellers" description="Only one offer is available for this product right now." />} />
        </Card>
        <Card>
          <CardHeader title={t("material.history")} subtitle="Average market price over time" />
          <div className="p-4">
            <PriceHistoryChart points={p.history ?? []} lang={lang} />
          </div>
        </Card>
      </div>

      <section className="mt-12">
        <SectionHeading title={t("shop.related")} href={p.category ? `/shop/products?categoryId=${p.category.id}` : "/shop/products"} />
        <ProductRail products={p.related ?? []} emptyText="No related products." />
      </section>
    </div>
  );
}
