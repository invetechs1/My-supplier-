"use client";

import Link from "next/link";
import { useState } from "react";
import { SAUDI_CITIES } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { marketplaceApi } from "@/lib/api/marketplace";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar } from "@/lib/format";
import { Alert, Button, Input, Modal, Select } from "@/components/ui";

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cn("h-5 w-5", className)} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

/** "Price alert" button + modal: target price and/or back-in-stock notification for one product. */
export function PriceAlertButton({ materialId, currentPrice, inStock, unit, className }: { materialId: string; currentPrice?: number | null; inStock?: boolean; unit?: string; className?: string }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const { deliveryCity, notify } = useCart();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [backInStock, setBackInStock] = useState(!inStock);
  const [city, setCity] = useState(deliveryCity);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const openModal = () => {
    setError(null);
    setDone(false);
    setBackInStock(!inStock);
    setCity(deliveryCity);
    if (currentPrice && !target) setTarget(String(Math.floor(currentPrice * 0.9 * 100) / 100));
    setOpen(true);
  };

  const submit = async () => {
    const price = target.trim() ? Number(target) : null;
    if (price !== null && (!Number.isFinite(price) || price <= 0)) {
      setError("Enter a valid target price.");
      return;
    }
    if (price === null && !backInStock) {
      setError("Set a target price or enable back-in-stock notifications.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await marketplaceApi.createAlert({ materialId, targetPrice: price, notifyBackInStock: backInStock, city: city || null });
      setDone(true);
      notify({ kind: "success", message: "Price alert saved", actionHref: "/dashboard/alerts", actionLabel: "My alerts" });
    } catch (err) {
      setError(errorMessage(err, "Could not save the alert."));
    } finally {
      setSaving(false);
    }
  };

  const button = (
    <Button type="button" variant="outline" className={className} onClick={openModal} aria-haspopup="dialog">
      <BellIcon className="h-4 w-4" />
      Price alert
    </Button>
  );

  if (!user) {
    return (
      <Link href="/login" className={cn("inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50", className)} title="Sign in to set a price alert">
        <BellIcon className="h-4 w-4" />
        Price alert
      </Link>
    );
  }

  return (
    <>
      {button}
      <Modal
        open={open}
        title="Set a price alert"
        onClose={() => setOpen(false)}
        footer={
          done ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} loading={saving}>
                Save alert
              </Button>
            </>
          )
        }
      >
        {done ? (
          <Alert kind="success">
            We will notify you {target.trim() ? `when the best price drops to ${formatSar(Number(target), lang)}${unit ? ` / ${unit}` : ""}` : ""}
            {target.trim() && backInStock ? " or " : ""}
            {backInStock ? "when the product is back in stock" : ""}.
          </Alert>
        ) : (
          <div className="space-y-4">
            {currentPrice ? (
              <p className="text-sm text-slate-600">
                Current best price: <span className="font-semibold tabular-nums text-slate-900">{formatSar(currentPrice, lang)}</span>
                {unit ? <span className="text-slate-500"> / {unit}</span> : null}
              </p>
            ) : (
              <p className="text-sm text-slate-600">No offer is available right now — we can tell you when one appears.</p>
            )}
            <Input name="targetPrice" type="number" inputMode="decimal" step="0.01" min={0} label="Notify me when the price is at or below (SAR)" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 250" dir="ltr" />
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <span>Also notify me when it is back in stock</span>
              <input type="checkbox" checked={backInStock} onChange={(e) => setBackInStock(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            </label>
            <Select name="alertCity" label="Only offers deliverable to (optional)" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Any city" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
            {error && <Alert>{error}</Alert>}
            <p className="text-xs text-slate-500">One alert per product. Saving again replaces your previous alert.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
