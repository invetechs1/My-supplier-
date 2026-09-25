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
  const { t, lang } = useI18n();
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
      setError(t("product.invalidTarget"));
      return;
    }
    if (price === null && !backInStock) {
      setError(t("product.alertNeedsCondition"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await marketplaceApi.createAlert({ materialId, targetPrice: price, notifyBackInStock: backInStock, city: city || null });
      setDone(true);
      notify({ kind: "success", message: t("product.alertSaved"), actionHref: "/dashboard/alerts", actionLabel: t("product.myAlerts") });
    } catch (err) {
      setError(errorMessage(err, t("product.couldNotSaveAlert")));
    } finally {
      setSaving(false);
    }
  };

  const button = (
    <Button type="button" variant="outline" className={className} onClick={openModal} aria-haspopup="dialog">
      <BellIcon className="h-4 w-4" />
      {t("product.priceAlert")}
    </Button>
  );

  if (!user) {
    return (
      <Link href="/login" className={cn("inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50", className)} title={t("product.signInForAlert")}>
        <BellIcon className="h-4 w-4" />
        {t("product.priceAlert")}
      </Link>
    );
  }

  return (
    <>
      {button}
      <Modal
        open={open}
        title={t("product.setPriceAlert")}
        onClose={() => setOpen(false)}
        footer={
          done ? (
            <Button onClick={() => setOpen(false)}>{t("common.done")}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submit} loading={saving}>
                {t("product.saveAlert")}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <Alert kind="success">
            {t("product.willNotify")} {target.trim() ? `${t("product.whenPriceDrops")} ${formatSar(Number(target), lang)}${unit ? ` / ${unit}` : ""}` : ""}
            {target.trim() && backInStock ? ` ${t("product.or")} ` : ""}
            {backInStock ? t("product.whenBackInStock") : ""}.
          </Alert>
        ) : (
          <div className="space-y-4">
            {currentPrice ? (
              <p className="text-sm text-slate-600">
                {t("product.currentBestPrice")} <span className="font-semibold tabular-nums text-slate-900">{formatSar(currentPrice, lang)}</span>
                {unit ? <span className="text-slate-500"> / {unit}</span> : null}
              </p>
            ) : (
              <p className="text-sm text-slate-600">{t("product.noOfferNow")}</p>
            )}
            <Input name="targetPrice" type="number" inputMode="decimal" step="0.01" min={0} label={t("product.notifyAtOrBelow")} value={target} onChange={(e) => setTarget(e.target.value)} placeholder={t("product.egPrice")} dir="ltr" />
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <span>{t("product.alsoBackInStock")}</span>
              <input type="checkbox" checked={backInStock} onChange={(e) => setBackInStock(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            </label>
            <Select name="alertCity" label={t("product.onlyDeliverableTo")} value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("product.anyCity")} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
            {error && <Alert>{error}</Alert>}
            <p className="text-xs text-slate-500">{t("product.oneAlertNote")}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
