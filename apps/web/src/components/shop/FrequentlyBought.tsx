"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { asPriced, type ShopProduct } from "@/lib/api/marketplace";
import { isPurchasable, minQtyFor, useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { Button, Card, CardHeader } from "@/components/ui";
import { ProductImage } from "./ProductCard";

/** "Frequently bought together" strip: the current product plus up to 3 companions, with one "Add all" action. */
export function FrequentlyBought({ product, items }: { product: ShopProduct; items: ShopProduct[] }) {
  const { t, lang } = useI18n();
  const { add, busy, notify } = useCart();
  const candidates = useMemo(() => items.filter((p) => p.id !== product.id && isPurchasable(p.bestOffer)).slice(0, 3), [items, product.id]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.map((p) => p.id)));
  const [adding, setAdding] = useState(false);
  if (candidates.length === 0) return null;

  const bundle = [product, ...candidates.filter((p) => selected.has(p.id))].filter((p) => isPurchasable(p.bestOffer));
  const total = bundle.reduce((sum, p) => {
    const o = asPriced(p.bestOffer);
    return sum + (o ? o.effectivePrice * minQtyFor(o) : 0);
  }, 0);

  const addAll = async () => {
    setAdding(true);
    let ok = 0;
    try {
      for (const p of bundle) {
        const offer = p.bestOffer!;
        if (await add(offer.listingId, minQtyFor(offer), { offer, material: p })) ok += 1;
      }
      if (ok > 0) notify({ kind: "success", message: `${t("product.added")} ${ok} ${ok === 1 ? t("cart.itemOne") : t("cart.itemMany")} ${t("product.toYourCart")}`, actionHref: "/cart", actionLabel: t("cart.viewCart") });
    } finally {
      setAdding(false);
    }
  };

  const tile = (p: ShopProduct, isCurrent: boolean) => {
    const o = asPriced(p.bestOffer);
    const name = lang === "ar" ? p.nameAr || p.name : p.name;
    return (
      <div key={p.id} className="flex w-40 shrink-0 flex-col items-center text-center">
        <label className="flex cursor-pointer flex-col items-center">
          <span className="relative block h-28 w-28 rounded-lg bg-slate-50 p-2">
            <ProductImage material={p} />
            {!isCurrent && (
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(p.id);
                  else next.delete(p.id);
                  setSelected(next);
                }}
                aria-label={`${t("product.include")} ${name}`}
                className="absolute start-1 top-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
            )}
          </span>
        </label>
        <Link href={`/shop/products/${p.id}`} className="mt-2 line-clamp-2 text-xs font-medium text-slate-800 hover:text-brand-700">
          {isCurrent ? <span className="text-slate-500">{t("product.thisItem")} </span> : null}
          {name}
        </Link>
        {o && (
          <span className="mt-1 text-sm font-semibold tabular-nums text-brand-700">
            {formatSar(o.effectivePrice, lang)}
            {minQtyFor(o) > 1 && <span className="text-[11px] font-normal text-slate-400"> × {minQtyFor(o)}</span>}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader title={t("product.fbt")} subtitle={t("product.fbtSubtitle")} />
      <div className="flex flex-col gap-6 px-5 py-5 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {tile(product, true)}
          {candidates.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="text-2xl text-slate-300" aria-hidden>
                +
              </span>
              {tile(p, false)}
            </div>
          ))}
        </div>
        <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:w-60">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {t("product.totalFor")} {bundle.length} {bundle.length === 1 ? t("cart.itemOne") : t("cart.itemMany")}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{formatSar(total, lang)}</p>
          <p className="text-[11px] text-slate-400">{t("product.fbtNote")}</p>
          <Button className="mt-3 w-full" variant="accent" onClick={addAll} loading={adding} disabled={busy || bundle.length === 0}>
            {t("product.addAllToCart")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
