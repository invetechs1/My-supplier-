"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { Material, Product, ShopOffer } from "@mysupplier/shared";
import { API_URL } from "@/lib/api";
import { asPriced, bestTier, isOnSale, savingsPercent, type ShopProduct } from "@/lib/api/marketplace";
import { isPurchasable, minQtyFor, useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar } from "@/lib/format";
import { Badge, Button, Stars, VerifiedBadge } from "@/components/ui";

/** Product image: the material's own image or the API-generated SVG for its SKU. */
export function productImageUrl(m: Pick<Material, "sku" | "imageUrl">): string {
  return m.imageUrl || generatedImageUrl(m.sku);
}

export function generatedImageUrl(sku: string): string {
  return `${API_URL}/images/materials/${encodeURIComponent(sku)}.svg`;
}

/** Percentage the best offer sits below the average of all offers (null when not a discount). */
export function dealPercent(p: Pick<Product, "avgPrice" | "bestOffer">): number | null {
  const avg = p.avgPrice ?? null;
  const best = asPriced(p.bestOffer)?.effectivePrice ?? null;
  if (avg === null || best === null || avg <= 0 || best >= avg) return null;
  return Math.round(((avg - best) / avg) * 100);
}

export function ProductImage({ material, className, alt, src: srcOverride }: { material: Pick<Material, "sku" | "imageUrl" | "name">; className?: string; alt?: string; src?: string | null }) {
  const initial = srcOverride || productImageUrl(material);
  const [src, setSrc] = useState(initial);
  const [last, setLast] = useState(initial);
  // Follow prop changes (gallery) without an effect.
  if (initial !== last) {
    setLast(initial);
    setSrc(initial);
  }
  const fallback = generatedImageUrl(material.sku);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? material.name}
      loading="lazy"
      className={cn("h-full w-full object-contain", className)}
      onError={() => {
        if (src !== fallback) setSrc(fallback);
      }}
    />
  );
}

export function StockPill({ offer, inStock }: { offer?: ShopOffer | null; inStock?: boolean }) {
  const { t } = useI18n();
  const tracked = offer ? typeof offer.stock === "number" : inStock !== undefined;
  const available = offer ? (typeof offer.stock === "number" ? offer.stock > 0 : inStock ?? true) : inStock ?? false;
  if (!tracked && !offer) return null;
  if (!available && tracked) return <Badge tone="red">Out of stock</Badge>;
  return <Badge tone={tracked ? "green" : "slate"}>{tracked ? t("shop.inStock") : t("shop.onRequest")}</Badge>;
}

/** Compact "4.5 (12)" rating line; renders nothing without reviews. */
export function RatingLine({ average, count, className, size = "sm" }: { average?: number | null; count?: number | null; className?: string; size?: "sm" | "md" }) {
  if (!count || !average) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-slate-500", className)}>
      <Stars value={average} size={size} />
      <span className="tabular-nums">{average.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}

/** Sale / deal badge stack for a product tile. */
export function ProductBadges({ product: p, className }: { product: ShopProduct; className?: string }) {
  const { t } = useI18n();
  const offer = asPriced(p.bestOffer);
  const sale = isOnSale(offer);
  const salePct = offer ? savingsPercent(offer.compareAtPrice, offer.effectivePrice) : null;
  const pct = dealPercent(p);
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      {sale ? (
        <span className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">Sale{salePct !== null ? ` −${salePct}%` : ""}</span>
      ) : (
        (p.isDeal || pct !== null) && (
          <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-slate-900 shadow-sm">
            {t("shop.deal")}
            {pct !== null ? ` −${pct}%` : ""}
          </span>
        )
      )}
      {p.featured && <span className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">{t("shop.featured")}</span>}
    </div>
  );
}

/** Price block used by grid and list cards: effective price, strike-through, tier hint. */
export function CardPrice({ product: p, large }: { product: ShopProduct; large?: boolean }) {
  const { t, lang } = useI18n();
  const offer = asPriced(p.bestOffer);
  const tier = bestTier(offer);
  if (!offer) return <span className="text-sm text-slate-400">No offers yet</span>;
  const sale = isOnSale(offer);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        {!sale && <span className="text-xs text-slate-500">{t("shop.from")}</span>}
        <span className={cn("font-bold tabular-nums", sale ? "text-red-600" : "text-brand-700", large ? "text-2xl" : "text-lg")}>{formatSar(offer.effectivePrice, lang)}</span>
        {sale && offer.compareAtPrice && <s className="text-xs tabular-nums text-slate-400">{formatSar(offer.compareAtPrice, lang)}</s>}
        <span className="text-[11px] text-slate-400">/ {p.unit}</span>
      </div>
      {tier && tier.price < offer.effectivePrice && (
        <p className="text-xs text-emerald-700">
          {t("shop.from")} <span className="font-semibold tabular-nums">{formatSar(tier.price, lang)}</span> for {tier.minQty}+
        </p>
      )}
      {!tier && p.avgPrice !== null && p.avgPrice !== undefined && (
        <p className="text-xs text-slate-400">
          {t("shop.avg")} <span className="tabular-nums">{formatSar(p.avgPrice, lang)}</span>
        </p>
      )}
    </div>
  );
}

function SellerLine({ product: p }: { product: ShopProduct }) {
  const { t } = useI18n();
  const offer = p.bestOffer ?? null;
  const sellers = p.offerCount ?? p.supplierCount ?? 0;
  if (sellers === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {sellers > 1 ? (
        <span>
          Cheapest of {sellers} {t("shop.sellers")}
        </span>
      ) : (
        <span>1 seller</span>
      )}
      {offer?.verified && <VerifiedBadge verified />}
    </span>
  );
}

export function ProductCard({ product: p, className, layout = "grid" }: { product: ShopProduct; className?: string; layout?: "grid" | "list" }) {
  const { t, lang } = useI18n();
  const { add, busy } = useCart();
  const [adding, setAdding] = useState(false);
  const offer = p.bestOffer ?? null;
  const purchasable = isPurchasable(offer);
  const href = `/shop/products/${p.id}`;
  const name = lang === "ar" ? p.nameAr || p.name : p.name;
  const altName = lang === "ar" ? p.name : p.nameAr;

  const onAdd = async () => {
    if (!offer || !purchasable) return;
    setAdding(true);
    try {
      await add(offer.listingId, minQtyFor(offer), { offer, material: p });
    } finally {
      setAdding(false);
    }
  };

  const addButton = (
    <Button
      size="sm"
      className={layout === "grid" ? "w-full" : undefined}
      onClick={onAdd}
      loading={adding}
      disabled={!purchasable || busy}
      title={!offer ? "No purchasable offer" : !purchasable ? "Reference price — not purchasable" : undefined}
    >
      {t("shop.addToCart")}
    </Button>
  );

  if (layout === "list") {
    return (
      <article className={cn("group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card transition hover:shadow-card-hover", className)}>
        <Link href={href} className="relative block h-32 w-32 shrink-0 rounded-lg bg-slate-50 p-2 sm:h-40 sm:w-40">
          <ProductImage material={p} className="transition group-hover:scale-[1.03]" />
          <ProductBadges product={p} className="absolute start-1 top-1" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={href} className="line-clamp-2 text-base font-semibold text-slate-900 hover:text-brand-700">
                {name}
              </Link>
              {altName && <p className="truncate text-xs text-slate-500">{altName}</p>}
              <p className="mt-1 truncate text-xs text-slate-400">
                {p.brand ? (
                  <>
                    <Link href={`/brands/${encodeURIComponent(p.brand)}`} className="hover:text-brand-700 hover:underline">
                      {p.brand}
                    </Link>
                    {" · "}
                  </>
                ) : null}
                SKU {p.sku} · per {p.unit}
              </p>
            </div>
            <StockPill offer={offer} inStock={p.inStock} />
          </div>
          <RatingLine average={p.ratingAvg} count={p.ratingCount} className="mt-1" />
          {p.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
            <div className="text-xs text-slate-500">
              <CardPrice product={p} />
              <SellerLine product={p} />
            </div>
            {addButton}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card transition hover:shadow-card-hover", className)}>
      <Link href={href} className="relative block aspect-square bg-slate-50 p-4">
        <ProductImage material={p} className="transition group-hover:scale-[1.03]" />
        <ProductBadges product={p} className="absolute start-2 top-2" />
        <div className="absolute end-2 top-2">
          <StockPill offer={offer} inStock={p.inStock} />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link href={href} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-700">
          {name}
        </Link>
        {altName && <p className="mt-0.5 truncate text-xs text-slate-500">{altName}</p>}
        <p className="mt-1 truncate text-xs text-slate-400">
          {p.brand ? `${p.brand} · ` : ""}per {p.unit}
        </p>
        <RatingLine average={p.ratingAvg} count={p.ratingCount} className="mt-1" />
        <div className="mt-3">
          <CardPrice product={p} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <SellerLine product={p} />
        </div>
        <div className="mt-auto pt-4">{addButton}</div>
      </div>
    </article>
  );
}

/** Horizontal, scroll-snapping rail of product cards. */
export function ProductRail({ products, emptyText = "Nothing here yet." }: { products: ShopProduct[]; emptyText?: string }) {
  if (products.length === 0) return <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex snap-x snap-mandatory gap-4">
        {products.map((p) => (
          <div key={p.id} className="w-[220px] shrink-0 snap-start sm:w-[240px]">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectionHeading({ title, subtitle, href, linkLabel = "View all" }: { title: React.ReactNode; subtitle?: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="text-sm font-semibold text-brand-700 hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
