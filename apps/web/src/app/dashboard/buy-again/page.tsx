"use client";

import Link from "next/link";
import { useState } from "react";
import type { FrequentlyOrderedItem, OrderExtended } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { commerceApi } from "@/lib/api/commerce";
import { clampQty, isPurchasable, minQtyFor, useCart } from "@/lib/cart";
import { useAsync, useFlash, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { ProductImage, StockPill } from "@/components/shop/ProductCard";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FlashMessage, LinkButton, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui";

function FrequentCard({ item }: { item: FrequentlyOrderedItem }) {
  const { lang, t } = useI18n();
  const { add, busy } = useCart();
  const offer = isPurchasable(item.bestOffer) ? item.bestOffer : null;
  const [qty, setQty] = useState<number>(() => Math.max(minQtyFor(offer), Math.round(item.quantity / Math.max(1, item.orders)) || 1));
  const [adding, setAdding] = useState(false);
  const m = item.material;
  const name = lang === "ar" ? m.nameAr || m.name : m.name;
  const priceDelta = offer ? offer.price - item.lastUnitPrice : 0;

  const addToCart = async () => {
    if (!offer) return;
    setAdding(true);
    try {
      await add(offer.listingId, clampQty(offer, qty), { offer, material: m });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="flex flex-col p-4">
      <Link href={`/shop/products/${m.id}`} className="mx-auto h-28 w-28 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-2">
        <ProductImage material={m} />
      </Link>
      <Link href={`/shop/products/${m.id}`} className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-700">
        {name}
      </Link>
      <p className="text-xs text-slate-500">
        {m.brand ? `${m.brand} · ` : ""}
        {item.quantity} {m.unit} in {item.orders} {item.orders === 1 ? "order" : "orders"} · last {formatDate(item.lastOrderedAt, lang)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {offer ? (
          <>
            <span className="text-base font-semibold tabular-nums text-slate-900">{formatSar(offer.price, lang)}</span>
            <span className="text-xs text-slate-500">/ {m.unit} · {offer.companyName}</span>
            {priceDelta !== 0 && (
              <Badge tone={priceDelta < 0 ? "green" : "amber"} title={`You last paid ${formatSar(item.lastUnitPrice, lang)}`}>
                {priceDelta < 0 ? "▼" : "▲"} {formatSar(Math.abs(priceDelta), lang)} vs last
              </Badge>
            )}
          </>
        ) : (
          <span className="text-sm text-slate-500">No supplier currently offers this product.</span>
        )}
      </div>
      {offer && (
        <div className="mt-1">
          <StockPill offer={offer} />
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-3">
        <input
          type="number"
          aria-label={`Quantity of ${name}`}
          min={minQtyFor(offer)}
          value={qty}
          disabled={!offer}
          onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          onBlur={() => setQty(clampQty(offer, qty))}
          className="h-10 w-20 rounded-xl border border-slate-300 px-2 text-center text-sm tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50"
          dir="ltr"
        />
        {offer ? (
          <Button className="flex-1" onClick={addToCart} loading={adding} disabled={busy}>
            {t("shop.addToCart")}
          </Button>
        ) : (
          <LinkButton href={`/shop/products/${m.id}`} variant="outline" className="flex-1">
            View product
          </LinkButton>
        )}
      </div>
    </Card>
  );
}

function RecentOrderRow({ order, onReorder, busy }: { order: OrderExtended; onReorder: (o: OrderExtended) => void; busy: boolean }) {
  const { lang } = useI18n();
  const names = (order.items ?? []).map((i) => i.name);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/dashboard/orders/${order.id}`} className="font-semibold text-brand-700 hover:underline">{order.reference}</Link>
          <StatusBadge status={order.status} />
          <span className="text-xs text-slate-500">{formatDate(order.createdAt, lang)} · {order.company?.name ?? order.companyId}</span>
        </p>
        <p className="truncate text-xs text-slate-500">
          {names.length > 0 ? names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : "") : "No line items"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{formatSar(order.total, lang)}</span>
        <Button size="sm" variant="secondary" onClick={() => onReorder(order)} loading={busy} disabled={(order.items?.length ?? 0) === 0}>
          Reorder
        </Button>
      </div>
    </li>
  );
}

export default function BuyAgainPage() {
  const { t } = useI18n();
  usePageTitle(t("dash.buyAgain"));
  const { reload: reloadCart } = useCart();
  const frequent = useAsync(() => commerceApi.frequentlyOrdered(24), []);
  const orders = useAsync(() => api.orders(1), []);
  const [flash, setFlash] = useFlash(7000);
  const [reordering, setReordering] = useState<string | null>(null);

  const reorder = async (o: OrderExtended) => {
    setReordering(o.id);
    try {
      const result = await commerceApi.reorder(o.id);
      reloadCart();
      const dropped = result.skipped.filter((sk) => !/instead/i.test(sk.reason));
      const replaced = result.skipped.length - dropped.length;
      if (result.added === 0) {
        setFlash({ kind: "error", message: `Nothing from ${o.reference} could be added: ${dropped.map((sk) => `${sk.name} – ${sk.reason}`).join("; ")}` });
      } else {
        const extra = [replaced > 0 ? `${replaced} switched to the cheapest current supplier` : "", dropped.length > 0 ? `${dropped.length} skipped (${dropped.map((sk) => sk.name).join(", ")})` : ""].filter(Boolean).join(" · ");
        setFlash({ kind: "success", message: `${result.added} ${result.added === 1 ? "line" : "lines"} from ${o.reference} added to your cart${extra ? ` · ${extra}` : ""}.` });
      }
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setReordering(null);
    }
  };

  const recent = (orders.data?.data ?? []).filter((o) => o.status !== "CANCELLED").slice(0, 8);

  return (
    <div>
      <PageHeader
        title={t("dash.buyAgain")}
        subtitle="Your most-ordered materials over the last 12 months at today's best price, plus one-click reorders."
        action={<LinkButton href="/cart" variant="outline">Go to cart</LinkButton>}
      />
      <FlashMessage flash={flash} className="mb-4" />

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Frequently ordered</h2>
        {frequent.loading ? (
          <LoadingBlock />
        ) : frequent.error ? (
          <Alert onRetry={frequent.reload}>{frequent.error}</Alert>
        ) : (frequent.data ?? []).length === 0 ? (
          <Card>
            <EmptyState title="Nothing ordered yet" description="Materials you buy regularly will show up here for quick reordering." action={<LinkButton href="/shop">Browse the shop</LinkButton>} />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(frequent.data ?? []).map((item) => (
              <FrequentCard key={item.materialId} item={item} />
            ))}
          </div>
        )}
      </section>

      <section>
        <Card>
          <CardHeader title="Recent orders" subtitle="Add every line of a past order to your cart. Unavailable offers are replaced by the cheapest current one." action={<Link href="/dashboard/orders" className="text-xs font-semibold text-brand-700 hover:underline">{t("common.viewAll")}</Link>} />
          {orders.loading ? (
            <LoadingBlock />
          ) : orders.error ? (
            <div className="p-4"><Alert onRetry={orders.reload}>{orders.error}</Alert></div>
          ) : recent.length === 0 ? (
            <EmptyState title="No orders yet" description="Orders appear here after checkout." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((o) => (
                <RecentOrderRow key={o.id} order={o} onReorder={reorder} busy={reordering === o.id} />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
