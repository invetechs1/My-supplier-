"use client";
import React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SAUDI_CITIES, type CheckoutResult, type OrderExtended, type PaymentIntent, type PaymentMethod } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { usePaymentConfig } from "@/lib/payments";
import { cn, formatSar } from "@/lib/format";
import { MoyasarForm } from "@/components/MoyasarForm";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, LinkButton, LoadingBlock, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; description: string }> = [
  { value: "COD", label: "Cash on delivery", description: "Pay the driver when the materials arrive." },
  { value: "BANK_TRANSFER", label: "Bank transfer", description: "Bank details are included on the VAT invoice and the order page." },
  { value: "CARD", label: "Card", description: "Mada / Visa / Mastercard / Apple Pay — secured by Moyasar." },
];

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
  const { cart, items, loading: cartLoading, error: cartError, reload } = useCart();
  const { config: paymentConfig } = usePaymentConfig();
  const cardEnabled = !!paymentConfig?.cardPaymentsEnabled;
  usePageTitle(t("checkout.title"));

  const [form, setForm] = useState({ deliveryCity: "", deliveryAddress: "", contactPhone: "", paymentMethod: "COD" as PaymentMethod, notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [payingCard, setPayingCard] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/checkout");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      contactPhone: f.contactPhone || user.phone || user.company?.phone || "",
      deliveryCity: f.deliveryCity || user.company?.city || "",
    }));
  }, [user]);

  // If card payments turn out to be disabled after the config loads, fall back to COD.
  useEffect(() => {
    if (paymentConfig && !paymentConfig.cardPaymentsEnabled) {
      setForm((f) => (f.paymentMethod === "CARD" ? { ...f, paymentMethod: "COD" } : f));
    }
  }, [paymentConfig]);

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
    if (!form.deliveryCity) next.deliveryCity = "Choose a delivery city.";
    if (form.deliveryAddress.trim().length < 5) next.deliveryAddress = "Enter the delivery address.";
    if (!/^\+?\d[\d\s-]{6,}$/.test(form.contactPhone.trim())) next.contactPhone = "Enter a valid phone number.";
    if (form.paymentMethod === "CARD" && !cardEnabled) next.paymentMethod = "Card payments are not available yet.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.checkout({
        deliveryCity: form.deliveryCity,
        deliveryAddress: form.deliveryAddress.trim(),
        contactPhone: form.contactPhone.trim(),
        paymentMethod: form.paymentMethod,
        notes: form.notes.trim() || undefined,
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
              <CardHeader title="Delivery details" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Select label="Delivery city" name="deliveryCity" value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} placeholder="Select city" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.deliveryCity} required />
                <Input label="Contact phone" name="contactPhone" type="tel" autoComplete="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} error={errors.contactPhone} placeholder="+966 5x xxx xxxx" dir="ltr" required />
                <Textarea label="Delivery address" name="deliveryAddress" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} error={errors.deliveryAddress} placeholder="Site name, street, district, landmark…" className="sm:col-span-2" rows={3} required />
                <Textarea label="Notes for suppliers (optional)" name="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery window, gate access, crane on site…" className="sm:col-span-2" rows={2} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Payment method" />
              <CardBody>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Payment method</legend>
                  {PAYMENT_METHODS.map((m) => {
                    const checked = form.paymentMethod === m.value;
                    const disabled = m.value === "CARD" && !cardEnabled;
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
                            {m.label}
                            {disabled && <Badge tone="amber">Card payments coming soon</Badge>}
                            {m.value === "CARD" && cardEnabled && <Badge tone="green">Secure</Badge>}
                          </span>
                          <span className="block text-xs text-slate-500">{m.description}</span>
                          {m.value === "CARD" && cardEnabled && checked && (
                            <span className="mt-1 block text-xs font-medium text-brand-800">You will complete the card payment right after placing the order.</span>
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
                {items.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-medium text-slate-900">{lang === "ar" ? it.material.nameAr || it.material.name : it.material.name}</span>
                      <span className="block text-xs text-slate-500">
                        {it.quantity} {it.material.unit} × {formatSar(it.offer.price, lang)} · {it.offer.companyName}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-900">{formatSar(it.lineTotal, lang)}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-2 border-t border-slate-100 px-5 py-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular-nums">{formatSar(cart?.subtotal, lang)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">VAT (15%)</dt>
                  <dd className="tabular-nums">{formatSar(cart?.vat, lang)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Delivery</dt>
                  <dd className="tabular-nums">{formatSar(cart?.deliveryFee, lang)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
                  <dt className="font-semibold text-slate-900">Total</dt>
                  <dd className="font-bold tabular-nums text-brand-700">{formatSar(cart?.total, lang)}</dd>
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
