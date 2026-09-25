"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, type Address, type FrequentlyOrderedItem, type Product, type RecurringOrderLine, type RecurringOrderPayload, type RecurringPaymentMethod, type ShopOffer } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { commerceApi, formatAddressLine, type RecurringOrderWithLast } from "@/lib/api/commerce";
import { useAuth } from "@/lib/auth";
import { isPurchasable, useCart } from "@/lib/cart";
import { useAsync, useDebounce } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatSar, toDateTimeLocal } from "@/lib/format";
import { Alert, Badge, Button, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";

type Line = RecurringOrderLine & { price?: number };

const PAYMENT_OPTIONS: Array<{ value: RecurringPaymentMethod; label: string }> = [
  { value: "COD", label: "Cash on delivery" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CREDIT", label: "Credit terms" },
];

function lineFromOffer(offer: ShopOffer, material: { name: string; unit: string }, quantity: number): Line {
  return { listingId: offer.listingId, quantity, name: material.name, unit: material.unit, companyName: offer.companyName, price: offer.price };
}

/** Pick lines for a subscription from the cart, from frequently ordered materials or by searching the shop. */
function ItemPicker({ lines, onAdd }: { lines: Line[]; onAdd: (line: Line) => void }) {
  const { lang } = useI18n();
  const { items: cartItems } = useCart();
  const [tab, setTab] = useState<"cart" | "frequent" | "search">(cartItems.length > 0 ? "cart" : "frequent");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q.trim(), 300);
  const frequent = useAsync(() => commerceApi.frequentlyOrdered(20), [], tab === "frequent");
  const search = useAsync(() => api.shopProducts({ q: debouncedQ, pageSize: 8, inStock: undefined }), [debouncedQ], tab === "search" && debouncedQ.length >= 2);
  const has = (listingId: string) => lines.some((l) => l.listingId === listingId);

  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: "cart", label: `From cart (${cartItems.length})` },
    { key: "frequent", label: "Frequently ordered" },
    { key: "search", label: "Search products" },
  ];

  const row = (key: string, name: string, meta: React.ReactNode, offer: ShopOffer | null | undefined, unit: string, qty: number) => {
    const ok = isPurchasable(offer);
    const added = ok && has(offer.listingId);
    return (
      <li key={key} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{name}</span>
          <span className="block truncate text-xs text-slate-500">{meta}</span>
        </span>
        <Button size="sm" variant={added ? "ghost" : "outline"} disabled={!ok || added} onClick={() => ok && onAdd(lineFromOffer(offer, { name, unit }, qty))}>
          {added ? "Added" : ok ? "Add" : "Unavailable"}
        </Button>
      </li>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex flex-wrap gap-1 border-b border-slate-100 p-2" role="tablist">
        {tabs.map((tb) => (
          <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === tb.key ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-50"}`}>
            {tb.label}
          </button>
        ))}
      </div>
      <div className="max-h-56 overflow-y-auto px-3">
        {tab === "cart" &&
          (cartItems.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">Your cart is empty.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cartItems.map((ci) => row(ci.id, lang === "ar" ? ci.material.nameAr || ci.material.name : ci.material.name, `${ci.quantity} ${ci.material.unit} · ${ci.offer.companyName} · ${formatSar(ci.offer.price, lang)}/${ci.material.unit}`, ci.offer, ci.material.unit, ci.quantity))}
            </ul>
          ))}
        {tab === "frequent" &&
          (frequent.loading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : frequent.error ? (
            <p className="py-4 text-center text-xs text-red-600">{frequent.error}</p>
          ) : (frequent.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">No order history yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(frequent.data ?? []).map((f: FrequentlyOrderedItem) =>
                row(
                  f.materialId,
                  lang === "ar" ? f.material.nameAr || f.material.name : f.material.name,
                  f.bestOffer ? `${f.bestOffer.companyName} · ${formatSar(f.bestOffer.price, lang)}/${f.material.unit} · ${f.orders} past orders` : "No current offer",
                  f.bestOffer,
                  f.material.unit,
                  Math.max(f.bestOffer?.minQty ?? 1, Math.round(f.quantity / Math.max(1, f.orders)) || 1),
                ),
              )}
            </ul>
          ))}
        {tab === "search" && (
          <div className="py-2">
            <Input name="recurringSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cement, rebar, blocks…" aria-label="Search products" />
            {debouncedQ.length < 2 ? (
              <p className="py-3 text-center text-xs text-slate-500">Type at least 2 characters.</p>
            ) : search.loading ? (
              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            ) : search.error ? (
              <p className="py-3 text-center text-xs text-red-600">{search.error}</p>
            ) : (search.data?.data ?? []).length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">No products found.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(search.data?.data ?? []).map((p: Product) =>
                  row(p.id, lang === "ar" ? p.nameAr || p.name : p.name, p.bestOffer ? `${p.bestOffer.companyName} · ${formatSar(p.bestOffer.price, lang)}/${p.unit}` : "No current offer", p.bestOffer, p.unit, p.bestOffer?.minQty ?? 1),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FormState {
  name: string;
  intervalDays: string;
  startAt: string;
  deliveryCity: string;
  deliveryAddress: string;
  contactPhone: string;
  paymentMethod: RecurringPaymentMethod;
}

export function RecurringFormModal({
  open,
  existing,
  addresses,
  creditApproved,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: RecurringOrderWithLast | null;
  addresses: Address[];
  creditApproved: boolean;
  onClose: () => void;
  onSaved: (ro: RecurringOrderWithLast) => void;
}) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const defaultAddress = useMemo(() => addresses.find((a) => a.isDefault) ?? addresses[0] ?? null, [addresses]);
  const initial = useMemo<FormState>(
    () =>
      existing
        ? { name: existing.name, intervalDays: String(existing.intervalDays), startAt: toDateTimeLocal(existing.nextRunAt), deliveryCity: existing.deliveryCity, deliveryAddress: existing.deliveryAddress, contactPhone: existing.contactPhone, paymentMethod: existing.paymentMethod }
        : {
            name: "",
            intervalDays: "30",
            startAt: "",
            deliveryCity: defaultAddress?.city ?? user?.company?.city ?? "",
            deliveryAddress: defaultAddress ? formatAddressLine(defaultAddress) : "",
            contactPhone: defaultAddress?.phone ?? user?.phone ?? user?.company?.phone ?? "",
            paymentMethod: "COD",
          },
    [existing, defaultAddress, user],
  );
  const [form, setForm] = useState<FormState>(initial);
  const [lines, setLines] = useState<Line[]>(existing?.items ?? []);
  const [addressPick, setAddressPick] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setLines(existing?.items ?? []);
    setAddressPick("");
    setErrors({});
    setError(null);
  }, [open, initial, existing]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const applyAddress = (id: string) => {
    setAddressPick(id);
    const a = addresses.find((x) => x.id === id);
    if (a) set({ deliveryCity: a.city, deliveryAddress: formatAddressLine(a), contactPhone: a.phone });
  };
  const addLine = (line: Line) => setLines((prev) => (prev.some((l) => l.listingId === line.listingId) ? prev : [...prev, line]));
  const setQty = (listingId: string, quantity: number) => setLines((prev) => prev.map((l) => (l.listingId === listingId ? { ...l, quantity } : l)));
  const removeLine = (listingId: string) => setLines((prev) => prev.filter((l) => l.listingId !== listingId));
  const estimate = lines.reduce((s, l) => s + (l.price ?? 0) * l.quantity, 0);
  const allPriced = lines.every((l) => typeof l.price === "number");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const interval = Number(form.intervalDays);
    if (!form.name.trim()) next.name = "Name this schedule (e.g. Weekly cement).";
    if (!Number.isInteger(interval) || interval < 7 || interval > 90) next.intervalDays = "Between 7 and 90 days.";
    if (!form.deliveryCity) next.deliveryCity = "Choose a city.";
    if (form.deliveryAddress.trim().length < 5) next.deliveryAddress = "Enter the delivery address.";
    if (!/^\+?\d[\d\s-]{6,}$/.test(form.contactPhone.trim())) next.contactPhone = "Enter a valid phone number.";
    if (lines.length === 0) next.items = "Add at least one product.";
    if (lines.some((l) => !(l.quantity > 0))) next.items = "Every line needs a quantity above zero.";
    if (form.startAt && Number.isNaN(new Date(form.startAt).getTime())) next.startAt = "Invalid date.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setError(null);
    const payload: RecurringOrderPayload = {
      name: form.name.trim(),
      items: lines.map((l) => ({ listingId: l.listingId, quantity: l.quantity })),
      intervalDays: interval,
      deliveryCity: form.deliveryCity,
      deliveryAddress: form.deliveryAddress.trim(),
      contactPhone: form.contactPhone.trim(),
      paymentMethod: form.paymentMethod,
    };
    try {
      let saved: RecurringOrderWithLast;
      if (existing) {
        const nextRunChanged = form.startAt && toDateTimeLocal(existing.nextRunAt) !== form.startAt;
        saved = await commerceApi.updateRecurring(existing.id, { ...payload, ...(nextRunChanged ? { nextRunAt: new Date(form.startAt).toISOString() } : {}) });
      } else {
        saved = await commerceApi.createRecurring({ ...payload, ...(form.startAt ? { startAt: new Date(form.startAt).toISOString() } : {}) });
      }
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={existing ? `Edit ${existing.name}` : "New recurring order"}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="recurring-form" loading={saving}>{existing ? "Save changes" : "Create schedule"}</Button>
        </>
      }
    >
      <form id="recurring-form" onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Name" name="name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Weekly cement – Site A" error={errors.name} className="sm:col-span-2" required />
          <Input label="Every (days)" name="intervalDays" type="number" min={7} max={90} value={form.intervalDays} onChange={(e) => set({ intervalDays: e.target.value })} error={errors.intervalDays} hint="7 to 90 days" dir="ltr" required />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Products</span>
            {lines.length > 0 && (
              <span className="text-xs text-slate-500">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
                {allPriced ? ` · about ${formatSar(estimate, lang)} excl. VAT per run` : ""}
              </span>
            )}
          </div>
          {lines.length > 0 && (
            <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {lines.map((l) => (
                <li key={l.listingId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{l.name ?? l.listingId}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {l.companyName ?? "—"}
                      {typeof l.price === "number" ? ` · ${formatSar(l.price, lang)}/${l.unit ?? "unit"}` : ""}
                    </span>
                  </span>
                  <div className="flex items-center gap-1" dir="ltr">
                    <input
                      type="number"
                      min={1}
                      step="any"
                      value={l.quantity}
                      aria-label={`Quantity of ${l.name ?? "item"}`}
                      onChange={(e) => setQty(l.listingId, Math.max(0, Number(e.target.value) || 0))}
                      className="h-9 w-20 rounded-lg border border-slate-300 px-2 text-center text-sm tabular-nums focus:border-brand-600 focus:outline-none"
                    />
                    <span className="w-12 text-xs text-slate-500">{l.unit ?? ""}</span>
                  </div>
                  <button type="button" onClick={() => removeLine(l.listingId)} className="text-xs text-red-600 hover:underline">Remove</button>
                </li>
              ))}
            </ul>
          )}
          <ItemPicker lines={lines} onAdd={addLine} />
          {errors.items && <p className="mt-1 text-xs text-red-600">{errors.items}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.length > 0 && (
            <Select label="Fill from a saved address" name="addressPick" value={addressPick} onChange={(e) => applyAddress(e.target.value)} placeholder="Choose an address…" options={addresses.map((a) => ({ value: a.id, label: `${a.label} · ${a.city}` }))} className="sm:col-span-2" />
          )}
          <Select label="Delivery city" name="deliveryCity" value={form.deliveryCity} onChange={(e) => set({ deliveryCity: e.target.value })} placeholder="Select city" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.deliveryCity} required />
          <Input label="Contact phone" name="contactPhone" type="tel" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+966 5x xxx xxxx" dir="ltr" error={errors.contactPhone} required />
          <Textarea label="Delivery address" name="deliveryAddress" value={form.deliveryAddress} onChange={(e) => set({ deliveryAddress: e.target.value })} rows={2} className="sm:col-span-2" error={errors.deliveryAddress} required />
          <Select
            label="Payment method"
            name="paymentMethod"
            value={form.paymentMethod}
            onChange={(e) => set({ paymentMethod: e.target.value as RecurringPaymentMethod })}
            options={PAYMENT_OPTIONS.filter((o) => o.value !== "CREDIT" || creditApproved).map((o) => ({ value: o.value, label: o.label }))}
          />
          <Input
            label={existing ? "Next run" : "First run (optional)"}
            name="startAt"
            type="datetime-local"
            value={form.startAt}
            onChange={(e) => set({ startAt: e.target.value })}
            hint={existing ? "Change to reschedule the next order." : "Leave empty to run after the first interval."}
            error={errors.startAt}
            dir="ltr"
          />
        </div>
        {form.paymentMethod === "CREDIT" && <Badge tone="blue">Each run is charged to your credit terms; runs are skipped when the limit is exceeded.</Badge>}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
