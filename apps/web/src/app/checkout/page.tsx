"use client";
import React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, type Address, type CarrierCode, type CartItem, type CheckoutResult, type DeliveryQuote, type OrderExtended, type PaymentIntent, type PaymentMethod } from "@mysupplier/shared";
import { api, errorMessage, type CartWithQuotes } from "@/lib/api";
import { commerceApi, formatAddressLine, type CartLine, type CommerceCart } from "@/lib/api/commerce";
import { useAuth } from "@/lib/auth";
import { supplierKey, useCart } from "@/lib/cart";
import { SupplierDeliveryChooser } from "@/components/shop/DeliveryOptions";
import { LinePricingSummary } from "@/app/cart/LinePricing";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { usePaymentConfig } from "@/lib/payments";
import { cn, formatSar } from "@/lib/format";
import { MoyasarForm } from "@/components/MoyasarForm";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, LinkButton, LoadingBlock, PageHeader, Select, Spinner, StatusBadge, Textarea, VerifiedBadge } from "@/components/ui";

interface SupplierGroup {
  key: string;
  companyId: string | null;
  name: string;
  verified: boolean;
  city: string;
  items: CartItem[];
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; description: string }> = [
  { value: "COD", label: "Cash on delivery", description: "Pay the driver when the materials arrive." },
  { value: "BANK_TRANSFER", label: "Bank transfer", description: "Bank details are included on the VAT invoice and the order page." },
  { value: "CARD", label: "Card", description: "Mada / Visa / Mastercard / Apple Pay — secured by Moyasar." },
  { value: "CREDIT", label: "Credit terms", description: "Buy now, pay the invoice within your approved net terms." },
];

const MANUAL_ADDRESS = "__manual__";

/** Saved-address card used by the picker. */
function AddressOption({ address, checked, onSelect }: { address: Address; checked: boolean; onSelect: () => void }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition", checked ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50")}>
      <input type="radio" name="savedAddress" checked={checked} onChange={onSelect} className="mt-1 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-600" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
          {address.label}
          {address.isDefault && <Badge tone="blue">Default</Badge>}
        </span>
        <span className="block text-slate-700">{address.recipient}</span>
        <span className="block text-xs text-slate-500">{formatAddressLine(address)}</span>
        <span className="block text-xs text-slate-500" dir="ltr">{address.phone}</span>
      </span>
    </label>
  );
}

function paymentTone(status: string): "green" | "amber" | "slate" {
  if (status === "PAID") return "green";
  if (status === "UNPAID") return "amber";
  return "slate";
}

type IntentState = { status: "loading" } | { status: "ready"; intent: PaymentIntent } | { status: "error"; message: string };

/** Card payment step shown after checkout: one Moyasar form per order, paid one at a time. */
function CardPaymentStep({ orders }: { orders: OrderExtended[] }) {
  const { lang } = useI18n();
  const [intents, setIntents] = useState<Record<string, IntentState>>({});
  const [activeId, setActiveId] = useState<string>(orders[0]?.id ?? "");

  useEffect(() => {
    let active = true;
    orders.forEach((o) => {
      setIntents((prev) => (prev[o.id] ? prev : { ...prev, [o.id]: { status: "loading" } }));
      api
        .createPaymentIntent(o.id)
        .then((intent) => {
          if (active) setIntents((prev) => ({ ...prev, [o.id]: { status: "ready", intent } }));
        })
        .catch((err) => {
          if (active) setIntents((prev) => ({ ...prev, [o.id]: { status: "error", message: errorMessage(err) } }));
        });
    });
    return () => {
      active = false;
    };
  }, [orders]);

  const retry = (orderId: string) => {
    setIntents((prev) => ({ ...prev, [orderId]: { status: "loading" } }));
    api
      .createPaymentIntent(orderId)
      .then((intent) => setIntents((prev) => ({ ...prev, [orderId]: { status: "ready", intent } })))
      .catch((err) => setIntents((prev) => ({ ...prev, [orderId]: { status: "error", message: errorMessage(err) } })));
  };

  const activeOrder = orders.find((o) => o.id === activeId) ?? orders[0];
  const activeIntent = activeOrder ? intents[activeOrder.id] : undefined;

  return (
    <Card>
      <CardHeader
        title="Pay by card"
        subtitle={orders.length > 1 ? `You have ${orders.length} orders (one per supplier). Each is paid separately.` : "Complete the payment to confirm your order."}
      />
      <CardBody>
        {orders.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Orders to pay">
            {orders.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={o.id === activeOrder?.id}
                onClick={() => setActiveId(o.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition",
                  o.id === activeOrder?.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className="font-semibold">{o.reference}</span>
                <span className="ms-2 tabular-nums">{formatSar(o.total, lang)}</span>
              </button>
            ))}
          </div>
        )}
        {activeOrder && (!activeIntent || activeIntent.status === "loading") && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Spinner size="sm" /> Preparing secure payment…
          </div>
        )}
        {activeOrder && activeIntent?.status === "error" && (
          <Alert onRetry={() => retry(activeOrder.id)}>{activeIntent.message}</Alert>
        )}
        {activeOrder && activeIntent?.status === "ready" && <MoyasarForm key={activeOrder.id} orderId={activeOrder.id} intent={activeIntent.intent} />}
        <p className="mt-4 text-xs text-slate-500">
          Prefer to pay later? Your order is saved — open it from{" "}
          <Link href="/dashboard/orders" className="font-semibold text-brand-700 hover:underline">
            My orders
          </Link>{" "}
          and click <strong>Pay now</strong> at any time.
        </p>
      </CardBody>
    </Card>
  );
}

export default function CheckoutPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { cart, items, quotes, deliveryCity: cartCity, setDeliveryCity, loading: cartLoading, error: cartError, reload } = useCart();
  const { config: paymentConfig } = usePaymentConfig();
  const cardEnabled = !!paymentConfig?.cardPaymentsEnabled;
  usePageTitle(t("checkout.title"));

  const [form, setForm] = useState({ deliveryCity: "", deliveryAddress: "", contactPhone: "", paymentMethod: "COD" as PaymentMethod, notes: "", poNumber: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Saved addresses: the default one is pre-selected; "Use a different address" reveals the manual fields.
  const addressesState = useAsync(() => commerceApi.addresses(), [user?.id], !!user);
  const addresses = useMemo(() => addressesState.data ?? [], [addressesState.data]);
  const [addressChoice, setAddressChoice] = useState<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [saveMeta, setSaveMeta] = useState({ label: "", recipient: "" });
  const isCompanyBuyer = !!(user?.companyId || user?.company);
  useEffect(() => {
    if (addressesState.loading || addressChoice !== null) return;
    const def = addresses.find((a) => a.isDefault) ?? addresses[0];
    setAddressChoice(def ? def.id : MANUAL_ADDRESS);
  }, [addressesState.loading, addresses, addressChoice]);
  const selectedAddress = addressChoice && addressChoice !== MANUAL_ADDRESS ? addresses.find((a) => a.id === addressChoice) ?? null : null;
  const manualAddress = addressChoice === MANUAL_ADDRESS || (!addressesState.loading && addresses.length === 0);
  // A saved address drives the delivery city (carrier pricing) and the contact phone.
  useEffect(() => {
    if (!selectedAddress) return;
    setForm((f) => ({ ...f, deliveryCity: selectedAddress.city, contactPhone: selectedAddress.phone, deliveryAddress: formatAddressLine(selectedAddress) }));
    setErrors({});
  }, [selectedAddress]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [payingCard, setPayingCard] = useState(false);
  // Promotion code: validated server-side via GET /cart?coupon=; the priced cart replaces the plain cart in the summary.
  const COUPON_KEY = "ms_coupon";
  const [couponInput, setCouponInput] = useState("");
  const [couponCart, setCouponCart] = useState<CartWithQuotes | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const applyCoupon = async (code = couponInput) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setCouponCart(null); setCouponError(null); return; }
    setCouponBusy(true);
    try {
      const priced = await api.cart(cartCity || undefined, trimmed);
      if (priced.couponError || !priced.coupon) { setCouponCart(null); setCouponError(priced.couponError ?? "Coupon not valid"); }
      else { setCouponCart(priced); setCouponError(null); setCouponInput(priced.coupon.code); }
    } catch (err) {
      setCouponCart(null); setCouponError(errorMessage(err, "Could not check the coupon"));
    } finally { setCouponBusy(false); }
  };
  const removeCoupon = () => { setCouponInput(""); setCouponCart(null); setCouponError(null); try { localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ } };
  // A code entered on the cart page is carried over and applied once the cart is priced.
  const [pendingCoupon] = useState<string | null>(() => { try { return localStorage.getItem(COUPON_KEY); } catch { return null; } });
  useEffect(() => {
    if (pendingCoupon && cart && !couponCart && !couponInput) { setCouponInput(pendingCoupon); void applyCoupon(pendingCoupon); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCoupon, cart?.items.length]);
  // Re-price when the cart contents or city change while a coupon is applied.
  useEffect(() => {
    if (couponCart?.coupon) void applyCoupon(couponCart.coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart?.subtotal, cart?.items.length, cartCity]);
  const priced = (couponCart?.coupon ? couponCart : cart) as CommerceCart | null;
  const savings = priced?.savings ?? 0;
  const credit = priced?.credit ?? null;
  const creditAvailable = !!credit?.approved;
  /** Buyer's carrier choice per supplier id; `undefined` = keep the cart's default (cheapest) quote, `null` = supplier's own delivery. */
  const [chosen, setChosen] = useState<Record<string, DeliveryQuote | null | undefined>>({});

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/checkout");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      contactPhone: f.contactPhone || user.phone || user.company?.phone || "",
      deliveryCity: f.deliveryCity || cartCity || user.company?.city || "",
    }));
  }, [user, cartCity]);

  // Re-price delivery (GET /cart?deliveryCity=) whenever the buyer changes the city, and drop stale carrier choices.
  useEffect(() => {
    if (form.deliveryCity && form.deliveryCity !== cartCity) {
      setDeliveryCity(form.deliveryCity);
      setChosen({});
    }
  }, [form.deliveryCity, cartCity, setDeliveryCity]);

  const groups = useMemo<SupplierGroup[]>(() => {
    const map = new Map<string, SupplierGroup>();
    items.forEach((it) => {
      const key = supplierKey(it.offer);
      const g = map.get(key) ?? { key, companyId: it.offer.companyId, name: it.offer.companyName, verified: it.offer.verified, city: it.offer.city, items: [] };
      g.items.push(it);
      map.set(key, g);
    });
    return [...map.values()];
  }, [items]);

  // Delivery total shown in the summary: the cart's fee (cheapest quote or flat fee per supplier) adjusted for explicit choices.
  const quotesReady = !!form.deliveryCity && form.deliveryCity === cartCity && !cartLoading;
  const deliveryAdjustment = quotesReady
    ? groups.reduce((sum, g) => {
        if (!g.companyId) return sum;
        const pick = chosen[g.companyId];
        if (pick === undefined) return sum;
        const base = quotes[g.companyId]?.price ?? 0;
        // Falling back to "delivery by supplier" when a quote existed: the API applies the flat fee; we cannot know it here, so keep the base.
        if (pick === null) return sum;
        return sum + (pick.price - base);
      }, 0)
    : 0;
  const deliveryFee = (priced?.deliveryFee ?? 0) + deliveryAdjustment;
  const grandTotal = (priced?.total ?? 0) + deliveryAdjustment;
  const carrierBySupplier = useMemo(() => {
    const out: Record<string, CarrierCode> = {};
    if (!quotesReady) return out;
    groups.forEach((g) => {
      if (!g.companyId) return;
      const pick = chosen[g.companyId];
      const quote = pick === undefined ? quotes[g.companyId] : pick;
      if (quote) out[g.companyId] = quote.carrier;
    });
    return out;
  }, [groups, chosen, quotes, quotesReady]);

  // If card payments turn out to be disabled after the config loads, fall back to COD.
  useEffect(() => {
    if (paymentConfig && !paymentConfig.cardPaymentsEnabled) {
      setForm((f) => (f.paymentMethod === "CARD" ? { ...f, paymentMethod: "COD" } : f));
    }
  }, [paymentConfig]);
  // Credit terms disappear when the basket grows past the available limit.
  useEffect(() => {
    if (credit && !credit.canCoverCart) setForm((f) => (f.paymentMethod === "CREDIT" ? { ...f, paymentMethod: "COD" } : f));
  }, [credit]);

  if (authLoading || !user) return <LoadingBlock label={t("common.loading")} className="min-h-[60vh]" />;

  if (result) {
    const unpaidCardOrders = result.orders.filter((o) => o.paymentMethod === "CARD" && o.paymentStatus !== "PAID");
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{payingCard ? "One last step — complete your payment" : "Thank you — your order is placed"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {result.orders.length} {result.orders.length === 1 ? "order" : "orders"} created · total {formatSar(result.total, lang)} incl. VAT. Suppliers have been notified.
          </p>
        </div>

        {payingCard && unpaidCardOrders.length > 0 && (
          <div className="mb-6">
            <CardPaymentStep orders={unpaidCardOrders} />
          </div>
        )}

        <div className="space-y-4">
          {result.orders.map((o) => (
            <Card key={o.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <Link href={`/dashboard/orders/${o.id}`} className="text-base font-semibold text-brand-700 hover:underline">
                  {o.reference}
                </Link>
                <p className="text-sm text-slate-600">{o.company?.name ?? o.companyId}</p>
                <p className="text-xs text-slate-500">
                  {o.items?.length ?? 0} {o.items?.length === 1 ? "item" : "items"}
                  {o.paymentMethod ? ` · ${PAYMENT_METHODS.find((m) => m.value === o.paymentMethod)?.label ?? o.paymentMethod}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-semibold tabular-nums text-slate-900">{formatSar(o.total, lang)}</span>
                <StatusBadge status={o.status} />
                {o.paymentStatus && <Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>}
                <LinkButton href={`/dashboard/orders/${o.id}`} size="sm" variant="outline">
                  View
                </LinkButton>
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/dashboard/orders">All my orders</LinkButton>
          <LinkButton href="/shop" variant="outline">
            Continue shopping
          </LinkButton>
        </div>
      </div>
    );
  }

  const validate = () => {
    const next: Record<string, string> = {};
    if (manualAddress) {
      if (!form.deliveryCity) next.deliveryCity = "Choose a delivery city.";
      if (form.deliveryAddress.trim().length < 5) next.deliveryAddress = "Enter the delivery address.";
      if (!/^\+?\d[\d\s-]{6,}$/.test(form.contactPhone.trim())) next.contactPhone = "Enter a valid phone number.";
      if (saveAddress) {
        if (!saveMeta.label.trim()) next.saveLabel = "Give this address a name (e.g. Main site).";
        if (!saveMeta.recipient.trim()) next.saveRecipient = "Who receives the delivery?";
      }
    } else if (!selectedAddress) {
      next.address = "Choose a delivery address.";
    }
    if (form.paymentMethod === "CARD" && !cardEnabled) next.paymentMethod = "Card payments are not available yet.";
    if (form.paymentMethod === "CREDIT" && !credit?.canCoverCart) next.paymentMethod = "Credit terms cannot cover this order.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!couponCart?.coupon) setCouponError(null); // a rejected code that was never applied should not linger next to address errors
    if (!validate()) return;
    setSubmitting(true);
    try {
      let addressId = selectedAddress?.id;
      if (manualAddress && saveAddress) {
        // Store the address first so the order references it; a failure here does not block checkout.
        try {
          const saved = await commerceApi.createAddress({
            label: saveMeta.label.trim(),
            recipient: saveMeta.recipient.trim(),
            phone: form.contactPhone.trim(),
            city: form.deliveryCity,
            street: form.deliveryAddress.trim(),
            isDefault: addresses.length === 0,
          });
          addressId = saved.id;
          addressesState.setData((prev) => [...(prev ?? []).map((a) => ({ ...a, isDefault: saved.isDefault ? false : a.isDefault })), saved]);
        } catch (err) {
          setSubmitError(`The address could not be saved (${errorMessage(err)}); the order was not placed.`);
          setSubmitting(false);
          return;
        }
      }
      const res = await commerceApi.checkout({
        addressId,
        deliveryCity: form.deliveryCity,
        deliveryAddress: form.deliveryAddress.trim(),
        contactPhone: form.contactPhone.trim(),
        paymentMethod: form.paymentMethod,
        notes: form.notes.trim() || undefined,
        poNumber: form.poNumber.trim() || undefined,
        carrierBySupplier: Object.keys(carrierBySupplier).length > 0 ? carrierBySupplier : undefined,
        couponCode: couponCart?.coupon?.code,
      });
      setPayingCard(form.paymentMethod === "CARD" && cardEnabled && res.orders.length > 0);
      setResult(res);
      reload();
      window.scrollTo({ top: 0 });
    } catch (err) {
      setSubmitError(errorMessage(err, "Checkout failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-3 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/cart" className="hover:text-brand-700">
          {t("cart.title")}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{t("checkout.title")}</span>
      </nav>
      <PageHeader title={t("checkout.title")} subtitle="One order is created per supplier. You will receive a ZATCA-compliant VAT invoice for each." />

      {cartLoading ? (
        <LoadingBlock className="min-h-[40vh]" />
      ) : cartError && items.length === 0 ? (
        <Alert onRetry={reload}>{cartError}</Alert>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title={t("cart.empty")} description="Add products to your cart before checking out." action={<LinkButton href="/shop">Go to the shop</LinkButton>} />
        </Card>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Delivery details"
                subtitle={addresses.length > 0 ? "Choose a saved address or enter a new one." : undefined}
                action={
                  <Link href="/dashboard/addresses" className="text-xs font-semibold text-brand-700 hover:underline">
                    Manage addresses
                  </Link>
                }
              />
              <CardBody className="space-y-4">
                {addressesState.loading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner size="sm" /> Loading your addresses…</div>
                ) : addresses.length > 0 ? (
                  <fieldset className="grid gap-3 sm:grid-cols-2">
                    <legend className="sr-only">Saved addresses</legend>
                    {addresses.map((a) => (
                      <AddressOption key={a.id} address={a} checked={addressChoice === a.id} onSelect={() => { setAddressChoice(a.id); setSaveAddress(false); }} />
                    ))}
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-sm font-medium transition", manualAddress ? "border-brand-600 bg-brand-50/60 text-brand-800 ring-1 ring-brand-600" : "border-slate-300 text-slate-700 hover:bg-slate-50")}>
                      <input type="radio" name="savedAddress" checked={manualAddress} onChange={() => setAddressChoice(MANUAL_ADDRESS)} className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-600" />
                      Use a different address
                    </label>
                  </fieldset>
                ) : null}
                {errors.address && <p className="text-xs text-red-600">{errors.address}</p>}
                {addressesState.error && <Alert kind="warning" onRetry={addressesState.reload}>Saved addresses could not be loaded ({addressesState.error}). You can still enter the address below.</Alert>}

                {manualAddress && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Delivery city" name="deliveryCity" value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} placeholder="Select city" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.deliveryCity} required />
                    <Input label="Contact phone" name="contactPhone" type="tel" autoComplete="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} error={errors.contactPhone} placeholder="+966 5x xxx xxxx" dir="ltr" required />
                    <Textarea label="Delivery address" name="deliveryAddress" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} error={errors.deliveryAddress} placeholder="Site name, street, district, landmark…" className="sm:col-span-2" rows={3} required />
                    <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => {
                          setSaveAddress(e.target.checked);
                          if (e.target.checked && !saveMeta.recipient) setSaveMeta((m) => ({ ...m, recipient: user.name ?? "" }));
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                      />
                      Save this address to my address book
                    </label>
                    {saveAddress && (
                      <>
                        <Input label="Address name" name="saveLabel" value={saveMeta.label} onChange={(e) => setSaveMeta({ ...saveMeta, label: e.target.value })} placeholder="Main site, Warehouse, Head office…" error={errors.saveLabel} required />
                        <Input label="Recipient" name="saveRecipient" value={saveMeta.recipient} onChange={(e) => setSaveMeta({ ...saveMeta, recipient: e.target.value })} placeholder="Site manager name" error={errors.saveRecipient} required />
                      </>
                    )}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {isCompanyBuyer && (
                    <Input label="PO number (optional)" name="poNumber" value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} placeholder="Your purchase-order reference" hint="Printed on the VAT invoice and shown to the supplier." dir="ltr" maxLength={60} />
                  )}
                  <Textarea label="Notes for suppliers (optional)" name="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery window, gate access, crane on site…" className={isCompanyBuyer ? "" : "sm:col-span-2"} rows={2} />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Delivery options" subtitle={form.deliveryCity ? `Carrier prices to ${form.deliveryCity}, one delivery per supplier.` : "Choose a delivery city above to price delivery."} />
              <ul className="divide-y divide-slate-100">
                {groups.map((g) => (
                  <li key={g.key} className="px-5 py-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-900">{g.name}</span>
                      <VerifiedBadge verified={g.verified} />
                      <span className="text-xs text-slate-500">· ships from {g.city} · {g.items.length} {g.items.length === 1 ? "item" : "items"}</span>
                    </div>
                    {g.companyId ? (
                      cartLoading || !quotesReady ? (
                        <span className="inline-flex items-center gap-2 text-xs text-slate-500">{form.deliveryCity && <Spinner size="sm" />}{form.deliveryCity ? "Pricing delivery…" : "Select a delivery city."}</span>
                      ) : (
                        <SupplierDeliveryChooser
                          supplierId={g.companyId}
                          items={g.items}
                          deliveryCity={form.deliveryCity}
                          defaultQuote={quotes[g.companyId]}
                          selected={chosen[g.companyId] === undefined ? quotes[g.companyId] ?? null : chosen[g.companyId] ?? null}
                          onSelect={(q) => setChosen((prev) => ({ ...prev, [g.companyId as string]: q }))}
                        />
                      )
                    ) : (
                      <span className="text-xs text-slate-500">Reference listing — delivery arranged by the supplier.</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Payment method" />
              <CardBody>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Payment method</legend>
                  {PAYMENT_METHODS.filter((m) => m.value !== "CREDIT" || creditAvailable).map((m) => {
                    const checked = form.paymentMethod === m.value;
                    const creditBlocked = m.value === "CREDIT" && !!credit && !credit.canCoverCart;
                    const disabled = (m.value === "CARD" && !cardEnabled) || creditBlocked;
                    return (
                      <label
                        key={m.value}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-4 transition",
                          disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70" : "cursor-pointer",
                          !disabled && (checked ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50"),
                        )}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={m.value}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => setForm({ ...form, paymentMethod: m.value })}
                          className="mt-1 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-600"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                            {m.value === "CREDIT" && credit ? `Credit terms (net ${credit.termsDays} days)` : m.label}
                            {m.value === "CARD" && disabled && <Badge tone="amber">Card payments coming soon</Badge>}
                            {m.value === "CARD" && cardEnabled && <Badge tone="green">Secure</Badge>}
                            {m.value === "CREDIT" && credit && <Badge tone={credit.canCoverCart ? "green" : "amber"}>{formatSar(credit.available, lang)} available</Badge>}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {m.value === "CREDIT" && credit
                              ? `Pay the invoice within ${credit.termsDays} days. Limit ${formatSar(credit.limit, lang)} · used ${formatSar(credit.used, lang)}.`
                              : m.description}
                          </span>
                          {creditBlocked && credit && (
                            <span className="mt-1 block text-xs font-medium text-amber-800">
                              This order ({formatSar(grandTotal, lang)}) exceeds your available credit of {formatSar(credit.available, lang)}. Reduce the basket or settle open invoices to use credit terms.
                            </span>
                          )}
                          {m.value === "CARD" && cardEnabled && checked && (
                            <span className="mt-1 block text-xs font-medium text-brand-800">You will complete the card payment right after placing the order.</span>
                          )}
                          {m.value === "CREDIT" && checked && credit && (
                            <span className="mt-1 block text-xs font-medium text-brand-800">Invoice due {new Date(Date.now() + credit.termsDays * 86400000).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}.</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                {errors.paymentMethod && <p className="mt-2 text-xs text-red-600">{errors.paymentMethod}</p>}
              </CardBody>
            </Card>
          </div>

          <div className="lg:sticky lg:top-24 lg:h-fit">
            <Card>
              <CardHeader title={t("cart.summary")} subtitle={`${items.length} ${items.length === 1 ? "item" : "items"} · ${cart?.supplierCount ?? 0} ${(cart?.supplierCount ?? 0) === 1 ? "supplier" : "suppliers"}`} />
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto px-5 text-sm">
                {items.map((it) => {
                  const line = it as CartLine;
                  const unit = line.unitPrice ?? it.offer.price;
                  return (
                    <li key={it.id} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="line-clamp-1 font-medium text-slate-900">{lang === "ar" ? it.material.nameAr || it.material.name : it.material.name}</span>
                        <span className="block text-xs text-slate-500">
                          {it.quantity} {it.material.unit} × {formatSar(unit, lang)}
                          {typeof line.basePrice === "number" && line.basePrice > unit && <s className="ms-1 text-slate-400">{formatSar(line.basePrice, lang)}</s>} · {it.offer.companyName}
                        </span>
                        <LinePricingSummary line={line} />
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-900">{formatSar(it.lineTotal, lang)}</span>
                    </li>
                  );
                })}
              </ul>
              <dl className="space-y-2 border-t border-slate-100 px-5 py-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular-nums">{formatSar(priced?.subtotal, lang)}</dd>
                </div>
                {savings > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Savings <span className="text-xs text-emerald-600">(tiers &amp; sales)</span></dt>
                    <dd className="tabular-nums">− {formatSar(savings, lang)}</dd>
                  </div>
                )}
                <div>
                  {couponCart?.coupon ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                      <span>
                        <span className="font-mono font-semibold" dir="ltr">{couponCart.coupon.code}</span>
                        {couponCart.coupon.description ? <span className="ms-2 text-brand-700">{couponCart.coupon.description}</span> : null}
                      </span>
                      <button type="button" onClick={removeCoupon} className="font-medium underline">Remove</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input name="coupon" placeholder="Promo code" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); } }} dir="ltr" className="font-mono uppercase" aria-label="Promo code" />
                      <Button type="button" variant="outline" size="sm" onClick={() => void applyCoupon()} loading={couponBusy} disabled={!couponInput.trim()}>Apply</Button>
                    </div>
                  )}
                  {couponError && <p className="mt-1 text-xs text-red-600">{couponError}</p>}
                </div>
                {couponCart?.coupon && (
                  <div className="flex justify-between text-brand-700">
                    <dt>Discount</dt>
                    <dd className="tabular-nums">− {formatSar(couponCart.discount ?? 0, lang)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">VAT (15%)</dt>
                  <dd className="tabular-nums">{formatSar(priced?.vat, lang)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">
                    Delivery
                    {quotesReady && Object.keys(carrierBySupplier).length > 0 && <span className="ms-1 text-xs text-slate-400">({Object.keys(carrierBySupplier).length} carrier {Object.keys(carrierBySupplier).length === 1 ? "quote" : "quotes"})</span>}
                  </dt>
                  <dd className="tabular-nums">{formatSar(deliveryFee, lang)}</dd>
                </div>
                {quotesReady &&
                  groups.map((g) => {
                    if (!g.companyId) return null;
                    const pick = chosen[g.companyId];
                    const quote = pick === undefined ? quotes[g.companyId] : pick;
                    return (
                      <div key={g.key} className="flex justify-between text-xs text-slate-500">
                        <dt className="truncate pe-2">↳ {g.name}</dt>
                        <dd className="shrink-0 tabular-nums">{quote ? `${quote.carrierName} · ${formatSar(quote.price, lang)}` : "Supplier delivery"}</dd>
                      </div>
                    );
                  })}
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
                  <dt className="font-semibold text-slate-900">Total</dt>
                  <dd className="font-bold tabular-nums text-brand-700">{formatSar(grandTotal, lang)}</dd>
                </div>
              </dl>
              <div className="px-5 pb-5">
                {submitError && (
                  <Alert className="mb-3">{submitError}</Alert>
                )}
                <Button type="submit" size="lg" variant="accent" className="w-full" loading={submitting}>
                  {form.paymentMethod === "CARD" && cardEnabled ? "Place order & pay" : t("checkout.placeOrder")}
                </Button>
                <p className="mt-3 text-center text-xs text-slate-400">
                  By placing the order you agree to our{" "}
                  <Link href="/terms" className="underline hover:text-slate-600">Terms</Link>,{" "}
                  <Link href="/refund-policy" className="underline hover:text-slate-600">Refund policy</Link> and each supplier&apos;s delivery terms.
                </p>
                <Link href="/cart" className="mt-2 block text-center text-xs font-semibold text-brand-700 hover:underline">
                  ← Edit cart
                </Link>
              </div>
            </Card>
          </div>
        </form>
      )}
    </div>
  );
}
