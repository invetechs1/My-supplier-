"use client";

import { useState } from "react";
import type { CarrierCode, CartItem, DeliveryQuote } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Spinner } from "../ui";

export const ZONE_LABEL: Record<DeliveryQuote["zone"], string> = { SAME_CITY: "Same city", SAME_REGION: "Same region", NATIONAL: "National" };

export function etaLabel(days: number): string {
  if (days <= 0) return "Same day";
  if (days === 1) return "Next day";
  return `${days} days`;
}

/** One-line description of a carrier quote, or the "Delivery by supplier" fallback. */
export function QuoteLine({ quote, className }: { quote: DeliveryQuote | null | undefined; className?: string }) {
  const { lang } = useI18n();
  if (!quote) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-2 text-sm text-slate-600", className)}>
        <TruckIcon />
        <span className="font-medium text-slate-900">Delivery by supplier</span>
        <span className="text-xs text-slate-500">Own fleet · supplier&apos;s standard fee</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2 text-sm text-slate-600", className)}>
      <TruckIcon />
      <span className="font-medium text-slate-900">{quote.carrierName}</span>
      <span>· {quote.service}</span>
      <span>· ETA {etaLabel(quote.etaDays)}</span>
      <span className="font-semibold tabular-nums text-slate-900">· {formatSar(quote.price, lang)}</span>
    </span>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 text-brand-600" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}

/** Radio-style list of carrier quotes for one supplier group. */
export function QuoteOptionList({ quotes, selected, onSelect, includeSupplierFallback }: { quotes: DeliveryQuote[]; selected: CarrierCode | null; onSelect: (carrier: CarrierCode | null) => void; includeSupplierFallback?: boolean }) {
  const { lang } = useI18n();
  const cheapest = quotes[0]?.price;
  return (
    <ul className="space-y-2">
      {quotes.map((q) => {
        const checked = selected === q.carrier;
        return (
          <li key={`${q.carrier}-${q.service}`}>
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", checked ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50")}>
              <input type="radio" name={`carrier-${q.carrier}`} checked={checked} onChange={() => onSelect(q.carrier)} className="mt-1 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  {q.carrierName}
                  {q.price === cheapest && <Badge tone="green">Cheapest</Badge>}
                  {q.etaDays <= 1 && <Badge tone="blue">Fast</Badge>}
                </span>
                <span className="block text-xs text-slate-500">
                  {q.service} · ETA {etaLabel(q.etaDays)} · {ZONE_LABEL[q.zone] ?? q.zone}
                  {q.weightKg > 0 ? ` · ${Math.round(q.weightKg)} kg` : ""}
                  {q.volumeM3 > 0 ? ` · ${q.volumeM3.toFixed(2)} m³` : ""}
                </span>
                {q.notes && <span className="block text-xs text-slate-500">{q.notes}</span>}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatSar(q.price, lang)}</span>
            </label>
          </li>
        );
      })}
      {includeSupplierFallback && (
        <li>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", selected === null ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50")}>
            <input type="radio" name="carrier-supplier" checked={selected === null} onChange={() => onSelect(null)} className="mt-1 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">Delivery by supplier</span>
              <span className="block text-xs text-slate-500">The supplier arranges delivery with its own fleet at its standard fee.</span>
            </span>
          </label>
        </li>
      )}
    </ul>
  );
}

/**
 * Delivery block for one supplier group at checkout: shows the cart's default quote and lets the buyer
 * load all options (POST /shipping/quote) and pick a carrier.
 */
export function SupplierDeliveryChooser({
  supplierId,
  items,
  deliveryCity,
  defaultQuote,
  selected,
  onSelect,
}: {
  supplierId: string;
  items: CartItem[];
  deliveryCity: string;
  defaultQuote: DeliveryQuote | null | undefined;
  selected: DeliveryQuote | null;
  onSelect: (quote: DeliveryQuote | null) => void;
}) {
  const [options, setOptions] = useState<DeliveryQuote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.shippingQuote({ supplierCompanyId: supplierId, deliveryCity, items: items.map((it) => ({ materialId: it.material.id, quantity: it.quantity })) });
      setOptions(res);
    } catch (err) {
      setError(errorMessage(err, "Could not load delivery options."));
    } finally {
      setLoading(false);
    }
  };

  if (!deliveryCity) return <p className="text-xs text-slate-500">Choose a delivery city to see carrier options and prices.</p>;

  if (options && options.length > 0) {
    return (
      <div className="space-y-2">
        <QuoteOptionList quotes={options} selected={selected?.carrier ?? null} onSelect={(code) => onSelect(options.find((q) => q.carrier === code) ?? null)} includeSupplierFallback={!defaultQuote} />
        <p className="text-xs text-slate-400">Carrier prices exclude VAT. The chosen option becomes the order&apos;s delivery fee.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <QuoteLine quote={selected ?? defaultQuote} />
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {options && options.length === 0 && <span className="text-xs text-slate-500">No other carriers serve this route.</span>}
        <Button type="button" size="sm" variant="outline" onClick={loadOptions} disabled={loading}>
          {loading ? <Spinner size="sm" /> : null}
          {options ? "Refresh" : "Other options"}
        </Button>
      </div>
    </div>
  );
}

export function DeliveryCityHint({ city }: { city: string }) {
  if (city) return null;
  return <Alert kind="info" className="text-xs">Pick a delivery city to get exact carrier prices; otherwise each supplier&apos;s standard fee is used.</Alert>;
}
