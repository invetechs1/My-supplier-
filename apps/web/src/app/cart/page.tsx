"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, type CartItem } from "@mysupplier/shared";
import { useAuth } from "@/lib/auth";
import { api, errorMessage } from "@/lib/api";
import { GUEST_DELIVERY_FEE_PER_SUPPLIER, clampQty, minQtyFor, supplierKey, useCart } from "@/lib/cart";
import { usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { Alert, Button, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, Select, VerifiedBadge } from "@/components/ui";
import { ProductImage, StockPill } from "@/components/shop/ProductCard";
import { QuoteLine } from "@/components/shop/DeliveryOptions";
import type { CartLine, CommerceCart } from "@/lib/api/commerce";
import { LineBadges, LineUnitPrice, NextTierHint } from "./LinePricing";

interface Group {
  key: string;
  name: string;
  companyId: string | null;
  verified: boolean;
  city: string;
  items: CartItem[];
  subtotal: number;
}

function QtyStepper({ item, onChange, disabled }: { item: CartItem; onChange: (qty: number) => void; disabled?: boolean }) {
  const offer = item.offer;
  const min = minQtyFor(offer);
  const cap = typeof offer.stock === "number" ? offer.stock : null;
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(item.quantity);
  const commit = () => {
    if (draft === null) return;
    const next = clampQty(offer, Number(draft));
    setDraft(null);
    if (next !== item.quantity) onChange(next);
  };
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white" dir="ltr">
      <button type="button" aria-label="Decrease" className="h-9 w-9 text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={disabled || item.quantity <= min} onClick={() => onChange(clampQty(offer, item.quantity - 1))}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={cap ?? undefined}
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={disabled}
        aria-label="Quantity"
        className="h-9 w-16 border-x border-slate-200 text-center text-sm tabular-nums focus:outline-none"
      />
      <button type="button" aria-label="Increase" className="h-9 w-9 text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={disabled || (cap !== null && item.quantity >= cap)} onClick={() => onChange(clampQty(offer, item.quantity + 1))}>
        +
      </button>
    </div>
  );
}

export default function CartPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("cart.title"));
  const router = useRouter();
  const { user } = useAuth();
  const { cart: rawCart, items, quotes, deliveryCity, setDeliveryCity, loading, busy, error, isGuest, update, remove, clear, reload } = useCart();
  // The server cart carries tier/sale pricing per line plus total savings; guest carts do not.
  const cart = rawCart as CommerceCart | null;
  const savings = cart?.savings ?? 0;
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // Promo code: validated server-side (GET /cart?coupon=) and remembered so checkout applies it automatically.
  const COUPON_KEY = "ms_coupon";
  const [couponInput, setCouponInput] = useState("");
  const [couponCart, setCouponCart] = useState<CommerceCart | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const applyCoupon = async (code = couponInput) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setCouponBusy(true);
    try {
      const priced = (await api.cart(deliveryCity || undefined, trimmed)) as unknown as CommerceCart;
      if (priced.couponError || !priced.coupon) { setCouponCart(null); setCouponError(priced.couponError ?? "Coupon not valid"); try { localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ } }
      else { setCouponCart(priced); setCouponError(null); setCouponInput(priced.coupon.code); try { localStorage.setItem(COUPON_KEY, priced.coupon.code); } catch { /* ignore */ } }
    } catch (err) {
      setCouponCart(null); setCouponError(errorMessage(err, "Could not check the coupon"));
    } finally { setCouponBusy(false); }
  };
  const removeCoupon = () => { setCouponInput(""); setCouponCart(null); setCouponError(null); try { localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ } };
  useEffect(() => {
    if (isGuest) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(COUPON_KEY); } catch { /* ignore */ }
    if (saved && !couponCart) { setCouponInput(saved); void applyCoupon(saved); }
    else if (couponCart?.coupon) void applyCoupon(couponCart.coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, cart?.subtotal, cart?.items.length, deliveryCity]);
  const shown = (couponCart?.coupon ? couponCart : cart) as CommerceCart | null;

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    items.forEach((it) => {
      const key = supplierKey(it.offer);
      const g = map.get(key) ?? { key, name: it.offer.companyName, companyId: it.offer.companyId, verified: it.offer.verified, city: it.offer.city, items: [], subtotal: 0 };
      g.items.push(it);
      g.subtotal += it.lineTotal ?? it.offer.price * it.quantity;
      map.set(key, g);
    });
    return [...map.values()];
  }, [items]);

  const act = async (id: string, fn: () => Promise<boolean>) => {
    setRowBusy(id);
    try {
      await fn();
    } finally {
      setRowBusy(null);
    }
  };

  const proceed = () => {
    if (!user) router.push("/login?redirect=/checkout");
    else router.push("/checkout");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={t("cart.title")}
        subtitle={items.length > 0 ? `${items.length} ${items.length === 1 ? "item" : "items"} from ${cart?.supplierCount ?? groups.length} ${(cart?.supplierCount ?? groups.length) === 1 ? "supplier" : "suppliers"}` : undefined}
        action={
          items.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600"
              onClick={() => {
                if (window.confirm("Remove all items from your cart?")) void clear();
              }}
              disabled={busy}
            >
              Clear cart
            </Button>
          ) : undefined
        }
      />
      {isGuest && items.length > 0 && (
        <Alert kind="info" className="mb-4">
          You are shopping as a guest. Your cart is saved on this device and will be merged into your account when you{" "}
          <Link href="/login?redirect=/cart" className="font-semibold underline">
            log in
          </Link>
          .
        </Alert>
      )}

      {loading ? (
        <LoadingBlock className="min-h-[40vh]" />
      ) : error && items.length === 0 ? (
        <Alert onRetry={reload}>{error}</Alert>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title={t("cart.empty")} description="Browse live supplier prices and add materials to get started." action={<LinkButton href="/shop">Go to the shop</LinkButton>} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {groups.map((g) => (
              <Card key={g.key}>
                <CardHeader
                  title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {g.companyId ? (
                        <Link href={`/suppliers/${g.companyId}`} className="hover:text-brand-700">
                          {g.name}
                        </Link>
                      ) : (
                        g.name
                      )}
                      <VerifiedBadge verified={g.verified} />
                    </span>
                  }
                  subtitle={`Ships from ${g.city}`}
                  action={
                    <span className="text-sm text-slate-600">
                      Subtotal <span className="font-semibold tabular-nums text-slate-900">{formatSar(g.subtotal, lang)}</span>
                    </span>
                  }
                />
                <ul className="divide-y divide-slate-100">
                  {g.items.map((it) => {
                    const line = it as CartLine;
                    const m = it.material;
                    const name = lang === "ar" ? m.nameAr || m.name : m.name;
                    const disabled = busy || rowBusy === it.id;
                    return (
                      <li key={it.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
                        <Link href={`/shop/products/${m.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-2">
                          <ProductImage material={m} />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/shop/products/${m.id}`} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-700">
                            {name}
                          </Link>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            {m.brand && <span>{m.brand}</span>}
                            <LineUnitPrice line={line} />
                            <LineBadges line={line} />
                          </p>
                          <p className="text-xs text-slate-500">
                            {it.offer.minQty > 1 ? `min ${it.offer.minQty} · ` : ""}
                            lead {it.offer.leadTimeDays} d
                          </p>
                          <NextTierHint line={line} className="mt-1" />
                          <div className="mt-1">
                            <StockPill offer={it.offer} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                          <QtyStepper item={it} disabled={disabled} onChange={(q) => act(it.id, () => update(it.id, q))} />
                          <div className="text-end">
                            <p className="text-base font-semibold tabular-nums text-slate-900">{formatSar(it.lineTotal ?? it.offer.price * it.quantity, lang)}</p>
                            <button type="button" className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={disabled} onClick={() => act(it.id, () => remove(it.id))}>
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!isGuest && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                    {deliveryCity && g.companyId ? (
                      <QuoteLine quote={quotes[g.companyId]} />
                    ) : (
                      <span className="text-xs text-slate-500">Choose a delivery city in the summary to see carrier prices for this supplier.</span>
                    )}
                    {deliveryCity && g.companyId && quotes[g.companyId] && <span className="text-xs text-slate-500">to {deliveryCity} · more options at checkout</span>}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <div className="lg:sticky lg:top-24 lg:h-fit">
            <Card>
              <CardHeader title={t("cart.summary")} />
              {!isGuest && (
                <div className="border-b border-slate-100 px-5 py-4">
                  <Select
                    label="Deliver to"
                    name="cartDeliveryCity"
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder="Select city for delivery prices"
                    options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))}
                  />
                  <p className="mt-1 text-xs text-slate-500">{deliveryCity ? "Delivery is priced with the cheapest carrier per supplier." : "Without a city each supplier's standard fee is used."}</p>
                </div>
              )}
              <dl className="space-y-2 px-5 py-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular-nums text-slate-900">{formatSar(cart?.subtotal, lang)}</dd>
                </div>
                {savings > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Savings <span className="text-xs text-emerald-600">(volume tiers &amp; sales)</span></dt>
                    <dd className="tabular-nums">− {formatSar(savings, lang)}</dd>
                  </div>
                )}
                {!isGuest && (
                  <div className="pb-1 pt-1">
                    {shown?.coupon ? (
                      <div className="flex items-center justify-between text-brand-700">
                        <dt>Coupon <span className="font-mono">{shown.coupon.code}</span></dt>
                        <dd className="flex items-center gap-2 tabular-nums">− {formatSar(shown.discount, lang)}<button type="button" className="text-xs text-slate-500 underline" onClick={removeCoupon}>Remove</button></dd>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input name="coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); } }} placeholder="Promo code" dir="ltr" aria-label="Promo code" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 font-mono text-sm uppercase focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600" />
                        <Button type="button" variant="outline" size="sm" onClick={() => void applyCoupon()} loading={couponBusy} disabled={!couponInput.trim()}>Apply</Button>
                      </div>
                    )}
                    {couponError && <p className="mt-1 text-xs text-red-600">{couponError}</p>}
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">VAT (15%)</dt>
                  <dd className="tabular-nums text-slate-900">{formatSar(shown?.vat ?? cart?.vat, lang)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">
                    Delivery
                    <span className="ms-1 text-xs text-slate-400">
                      ({cart?.supplierCount ?? groups.length} {(cart?.supplierCount ?? groups.length) === 1 ? "supplier" : "suppliers"}
                      {isGuest ? `, est. ${formatSar(GUEST_DELIVERY_FEE_PER_SUPPLIER, lang)} each` : ""})
                    </span>
                  </dt>
                  <dd className="tabular-nums text-slate-900">{formatSar(cart?.deliveryFee, lang)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
                  <dt className="font-semibold text-slate-900">Total</dt>
                  <dd className="font-bold tabular-nums text-brand-700">{formatSar(shown?.total ?? cart?.total, lang)}</dd>
                </div>
              </dl>
              <div className="px-5 pb-5">
                <Button size="lg" className="w-full" variant="accent" onClick={proceed} disabled={busy}>
                  {t("cart.checkout")}
                </Button>
                {isGuest && <p className="mt-2 text-center text-xs text-slate-500">You will be asked to log in or create an account.</p>}
                {savings > 0 && <p className="mt-2 text-center text-xs font-medium text-emerald-700">You are saving {formatSar(savings, lang)} with volume pricing.</p>}
                {cart?.credit?.approved && (
                  <p className="mt-2 text-center text-xs text-slate-500">
                    Credit terms available: {formatSar(cart.credit.available, lang)} of {formatSar(cart.credit.limit, lang)} (net {cart.credit.termsDays} days).
                  </p>
                )}
                <p className="mt-3 text-center text-xs text-slate-400">One order is created per supplier. Prices exclude VAT until checkout.</p>
              </div>
            </Card>
            <Link href="/shop" className="mt-4 block text-center text-sm font-semibold text-brand-700 hover:underline">
              ← Continue shopping
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
