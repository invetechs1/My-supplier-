"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { Material, Product, ShopOffer } from "@mysupplier/shared";
import { API_URL } from "@/lib/api";
import { isPurchasable, minQtyFor, useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar } from "@/lib/format";
import { Badge, Button, VerifiedBadge } from "@/components/ui";

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
  const best = p.bestOffer?.price ?? null;
  if (avg === null || best === null || avg <= 0 || best >= avg) return null;
  return Math.round(((avg - best) / avg) * 100);
}

export function ProductImage({ material, className, alt }: { material: Pick<Material, "sku" | "imageUrl" | "name">; className?: string; alt?: string }) {
  const [src, setSrc] = useState(productImageUrl(material));
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

export function ProductCard({ product: p, className }: { product: Product; className?: string }) {
  const { t, lang } = useI18n();
  const { add, busy } = useCart();
  const [adding, setAdding] = useState(false);
  const offer = p.bestOffer ?? null;
  const pct = dealPercent(p);
  const sellers = p.offerCount ?? p.supplierCount ?? 0;
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

  return (
    <article className={cn("group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card transition hover:shadow-card-hover", className)}>
      <Link href={href} className="relative block aspect-square bg-slate-50 p-4">
        <ProductImage material={p} className="transition group-hover:scale-[1.03]" />
        <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
          {(p.isDeal || pct !== null) && (
            <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-slate-900 shadow-sm">
              {t("shop.deal")}
              {pct !== null ? ` −${pct}%` : ""}
            </span>
          )}
          {p.featured && <span className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">{t("shop.featured")}</span>}
        </div>
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
        <div className="mt-3 flex items-baseline gap-2">
          {offer ? (
            <>
              <span className="text-xs text-slate-500">{t("shop.from")}</span>
              <span className="text-lg font-bold tabular-nums text-brand-700">{formatSar(offer.price, lang)}</span>
            </>
          ) : (
            <span className="text-sm text-slate-400">No offers yet</span>
          )}
        </div>
        {p.avgPrice !== null && p.avgPrice !== undefined && (
          <p className="text-xs text-slate-400">
            {t("shop.avg")} <span className="tabular-nums">{formatSar(p.avgPrice, lang)}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            {sellers} {sellers === 1 ? "seller" : t("shop.sellers")}
          </span>
          {offer?.verified && <VerifiedBadge verified />}
        </div>
        <div className="mt-auto pt-4">
          <Button
            size="sm"
            className="w-full"
            onClick={onAdd}
            loading={adding}
            disabled={!purchasable || busy}
            title={!offer ? "No purchasable offer" : !purchasable ? "Reference price — not purchasable" : undefined}
          >
            {t("shop.addToCart")}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Horizontal, scroll-snapping rail of product cards. */
export function ProductRail({ products, emptyText = "Nothing here yet." }: { products: Product[]; emptyText?: string }) {
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
