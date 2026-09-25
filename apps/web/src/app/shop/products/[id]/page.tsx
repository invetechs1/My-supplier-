"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Material, ProductReviewSummary } from "@mysupplier/shared";
import { type MaterialWithLogistics } from "@/lib/api";
import { asPriced, bestTier, fileUrl, isOnSale, marketplaceApi, nextTierFor, savingsPercent, tierFor, unitPriceFor, videoEmbedUrl, type PricedOffer } from "@/lib/api/marketplace";
import { clampQty, isPurchasable, minQtyFor, useCart } from "@/lib/cart";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, SourceBadge, Stars, Table, VerifiedBadge, type Column } from "@/components/ui";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { ProductBadges, ProductRail, RatingLine, SectionHeading, StockPill } from "@/components/shop/ProductCard";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { WishlistButton } from "@/components/shop/WishlistButton";
import { PriceAlertButton } from "@/components/shop/PriceAlertButton";
import { ProductReviews } from "@/components/shop/ProductReviews";
import { ProductQuestions } from "@/components/shop/ProductQuestions";
import { FrequentlyBought } from "@/components/shop/FrequentlyBought";
import { RecentlyViewed } from "@/components/shop/RecentlyViewed";
import { SpecTable } from "@/components/shop/SpecTable";

function OfferAddButton({ offer, product, size = "sm" }: { offer: PricedOffer; product: Material; size?: "sm" | "md" | "lg" }) {
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

/** Price cell for the offers table: effective price, strike-through while on sale, cheapest tier hint. */
function OfferPriceCell({ offer, unit }: { offer: PricedOffer; unit: string }) {
  const { lang } = useI18n();
  const sale = isOnSale(offer);
  const tier = bestTier(offer);
  return (
    <div className="text-end">
      <div className="flex items-baseline justify-end gap-1.5">
        <span className={cn("font-semibold tabular-nums", sale ? "text-red-600" : "text-slate-900")}>{formatSar(offer.effectivePrice, lang)}</span>
        {sale && offer.compareAtPrice && <s className="text-xs tabular-nums text-slate-400">{formatSar(offer.compareAtPrice, lang)}</s>}
      </div>
      {sale && (
        <span className="text-[11px] font-semibold text-red-600">
          Sale{offer.saleEndsAt ? ` until ${formatDate(offer.saleEndsAt, lang)}` : ""}
        </span>
      )}
      {!sale && tier && tier.price < offer.price && (
        <span className="block text-[11px] text-emerald-700">
          {formatSar(tier.price, lang)} / {unit} for {tier.minQty}+
        </span>
      )}
    </div>
  );
}

/** "Buy more, pay less" ladder for the buy box. */
function TierTable({ offer, qty, unit }: { offer: PricedOffer; qty: number; unit: string }) {
  const { lang } = useI18n();
  if (offer.tiers.length === 0) return null;
  const active = tierFor(offer, qty);
  const rows = [{ minQty: minQtyFor(offer), price: offer.price }, ...offer.tiers];
  const onSale = isOnSale(offer);
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
      <p className="border-b border-emerald-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">Buy more, pay less</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-1.5 text-start font-medium">
              Quantity
            </th>
            <th scope="col" className="px-3 py-1.5 text-end font-medium">
              Price / {unit}
            </th>
            <th scope="col" className="px-3 py-1.5 text-end font-medium">
              Save
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isActive = !onSale && ((active === null && i === 0) || (active !== null && active.minQty === r.minQty && i > 0));
            const save = savingsPercent(offer.price, r.price);
            const next = rows[i + 1];
            return (
              <tr key={r.minQty} className={cn(isActive && "bg-emerald-100/70 font-semibold text-emerald-900")} aria-current={isActive ? "true" : undefined}>
                <td className="px-3 py-1.5 tabular-nums">
                  {r.minQty}
                  {next ? ` – ${next.minQty - 1}` : "+"} {unit}
                </td>
                <td className="px-3 py-1.5 text-end tabular-nums">{formatSar(r.price, lang)}</td>
                <td className="px-3 py-1.5 text-end tabular-nums text-emerald-700">{save ? `−${save}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {onSale && <p className="px-3 pb-2 text-[11px] text-slate-500">The sale price applies while the sale is live; volume tiers resume afterwards.</p>}
    </div>
  );
}

export default function ShopProductPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { t, lang } = useI18n();
  const { add, busy, deliveryCity } = useCart();
  const state = useAsync(() => marketplaceApi.product(id, deliveryCity || undefined), [id, deliveryCity]);

  const p = state.data;
  const offers = useMemo(() => (p?.offers ?? []).map((o) => asPriced(o)!).sort((a, b) => a.effectivePrice - b.effectivePrice), [p?.offers]);
  const best: PricedOffer | null = asPriced(p?.bestOffer) ?? offers.find((o) => isPurchasable(o)) ?? offers[0] ?? null;
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ProductReviewSummary | null>(null);
  useEffect(() => {
    setQty(minQtyFor(best));
  }, [best?.listingId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setReviewSummary(p?.reviewSummary ?? null);
  }, [p?.reviewSummary]);
  usePageTitle(p ? (lang === "ar" ? p.nameAr || p.name : p.name) : null);

  if (state.loading && !p) return <LoadingBlock className="min-h-[50vh]" />;
  if (state.error || !p)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert onRetry={state.reload}>{state.error ?? "Product not found"}</Alert>
      </div>
    );

  const name = lang === "ar" ? p.nameAr || p.name : p.name;
  const altName = lang === "ar" ? p.name : p.nameAr;
  const purchasable = isPurchasable(best);
  const others = offers.filter((o) => o.listingId !== best?.listingId);
  const stockCap = best && typeof best.stock === "number" ? best.stock : null;
  const unitPrice = unitPriceFor(best, qty);
  const lineTotal = unitPrice * qty;
  const sale = isOnSale(best);
  const savePct = best ? savingsPercent(sale ? best.compareAtPrice : best.price, unitPrice) : null;
  const nextTier = nextTierFor(best, qty);
  const summary = reviewSummary ?? p.reviewSummary;
  const datasheet = fileUrl(p.datasheetUrl);
  const embed = videoEmbedUrl(p.videoUrl);
  const videoFile = p.videoUrl && !embed ? fileUrl(p.videoUrl) : null;
  const logistics = p as MaterialWithLogistics;

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

  const offerColumns: Column<PricedOffer>[] = [
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
          {o.rating > 0 && <Stars value={o.rating} />}
        </div>
      ),
    },
    { key: "city", header: t("common.city"), render: (o) => o.city },
    { key: "price", header: `Price / ${p.unit}`, align: "end", render: (o) => <OfferPriceCell offer={o} unit={p.unit} /> },
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
        {/* Gallery */}
        <div>
          <ProductGallery material={p} images={p.images} overlay={<ProductBadges product={p} />} />
        </div>

        {/* Info */}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{name}</h1>
          {altName && <p className="mt-1 text-lg text-slate-500">{altName}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {p.brand && (
              <Link href={`/brands/${encodeURIComponent(p.brand)}`} className="font-medium text-brand-700 hover:underline">
                Brand: {p.brand}
              </Link>
            )}
            {summary.count > 0 ? (
              <a href="#reviews" className="inline-flex items-center gap-1 hover:underline">
                <RatingLine average={summary.average} count={summary.count} size="md" />
                <span className="text-xs text-slate-500">· {summary.count === 1 ? "1 review" : `${summary.count} reviews`}</span>
              </a>
            ) : (
              <a href="#reviews" className="text-xs text-slate-500 hover:underline">
                No reviews yet
              </a>
            )}
            {p.questionsCount > 0 && (
              <a href="#questions" className="text-xs text-slate-500 hover:underline">
                {p.questionsCount} answered {p.questionsCount === 1 ? "question" : "questions"}
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="slate">SKU {p.sku}</Badge>
            <Badge tone="slate">Unit: {p.unit}</Badge>
            {p.category && <Badge tone="slate">{lang === "ar" ? p.category.nameAr : p.category.name}</Badge>}
            {logistics.hazardous && <Badge tone="red">Hazardous</Badge>}
          </div>
          {(logistics.weightKg || logistics.volumeM3) && (
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {logistics.weightKg ? (
                <div>
                  <dt className="inline text-slate-500">Weight per unit: </dt>
                  <dd className="inline font-medium tabular-nums text-slate-900">
                    {logistics.weightKg} kg / {p.unit}
                  </dd>
                </div>
              ) : null}
              {logistics.volumeM3 ? (
                <div>
                  <dt className="inline text-slate-500">Volume per unit: </dt>
                  <dd className="inline font-medium tabular-nums text-slate-900">
                    {logistics.volumeM3} m³ / {p.unit}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
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

          {(datasheet || embed || videoFile) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {datasheet && (
                <a href={datasheet} target="_blank" rel="noopener noreferrer" download className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-500" aria-hidden>
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  Datasheet (PDF)
                </a>
              )}
              {(embed || videoFile) && (
                <a href="#product-video" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  ▶ Watch video
                </a>
              )}
            </div>
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
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Best offer</p>
                {sale && <Badge tone="red">Sale{best.saleEndsAt ? ` · ends ${formatDate(best.saleEndsAt, lang)}` : ""}</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className={cn("text-3xl font-bold tabular-nums", sale ? "text-red-600" : "text-brand-700")}>{formatSar(unitPrice, lang)}</span>
                <span className="text-sm text-slate-500">/ {p.unit}</span>
                {savePct !== null && (sale || unitPrice < best.price) && (
                  <span className="flex items-baseline gap-1.5">
                    <s className="text-sm tabular-nums text-slate-400">{formatSar(sale ? best.compareAtPrice ?? best.price : best.price, lang)}</s>
                    <Badge tone="green">Save {savePct}%</Badge>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">Excl. 15% VAT · VAT invoice issued at checkout</p>
              {nextTier && (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                  Order <span className="font-semibold">{nextTier.minQty}+</span> to pay <span className="font-semibold tabular-nums">{formatSar(nextTier.price, lang)}</span> / {p.unit} (save {formatSar(nextTier.savePerUnit, lang)} each)
                </p>
              )}

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
                    <dt className="text-slate-500">Supplier rating</dt>
                    <dd>
                      <Stars value={best.rating} />
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

              <TierTable offer={best} qty={qty} unit={p.unit} />

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
                    {best.minQty > 1 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Minimum {best.minQty} {p.unit}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
                    <div className="flex items-baseline justify-between">
                      <span className="text-slate-500">Unit price</span>
                      <span className="tabular-nums text-slate-700">{formatSar(unitPrice, lang)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-slate-500">Line total</span>
                      <span className="text-lg font-semibold tabular-nums text-slate-900">{formatSar(lineTotal, lang)}</span>
                    </div>
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
              <div className="mt-3 flex flex-wrap gap-2">
                <WishlistButton materialId={p.id} listingId={purchasable ? best.listingId : null} quantity={qty} />
                <PriceAlertButton materialId={p.id} currentPrice={best.effectivePrice} inStock={p.inStock} unit={p.unit} className="flex-1" />
              </div>
            </>
          ) : (
            <>
              <EmptyState title="No offers yet" description="No supplier has listed this product. Request quotes or set an alert to hear when it is available." action={<Link href={`/dashboard/rfqs/new?materialId=${p.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Request quotes →</Link>} />
              <div className="flex flex-wrap gap-2">
                <WishlistButton materialId={p.id} />
                <PriceAlertButton materialId={p.id} inStock={false} unit={p.unit} className="flex-1" />
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-10 space-y-6">
        {p.frequentlyBoughtTogether?.length > 0 && <FrequentlyBought product={p} items={p.frequentlyBoughtTogether} />}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SpecTable specs={p.specs} attributes={p.attributes} />
            {(embed || videoFile) && (
              <Card id="product-video" className="scroll-mt-24 overflow-hidden">
                <CardHeader title="Product video" />
                <div className="aspect-video bg-black">
                  {embed ? (
                    <iframe src={embed} title={`${name} video`} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
                  ) : (
                    <video src={videoFile ?? undefined} controls className="h-full w-full" preload="metadata" />
                  )}
                </div>
              </Card>
            )}
          </div>
          <Card>
            <CardHeader title={t("material.history")} subtitle="Average market price over time" />
            <div className="p-4">
              <PriceHistoryChart points={p.history ?? []} lang={lang} />
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title={`${t("shop.otherSellers")} (${others.length})`} subtitle="All offers sorted by effective price. Market rows are reference prices only." />
          <Table columns={offerColumns} rows={others} rowKey={(o) => o.listingId} empty={<EmptyState title="No other sellers" description="Only one offer is available for this product right now." />} />
        </Card>

        <ProductReviews productId={p.id} initialSummary={p.reviewSummary} onSummaryChange={setReviewSummary} />
        <ProductQuestions productId={p.id} initialCount={p.questionsCount} />
      </div>

      <section className="mt-12">
        <SectionHeading title={t("shop.related")} href={p.category ? `/shop/products?categoryId=${p.category.id}` : "/shop/products"} />
        <ProductRail products={p.related ?? []} emptyText="No related products." />
      </section>

      <div className="mt-12">
        <RecentlyViewed excludeId={p.id} />
      </div>
    </div>
  );
}
