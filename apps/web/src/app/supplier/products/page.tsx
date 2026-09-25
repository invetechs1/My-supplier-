"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useRef, useState } from "react";
import type { ListingStatus, ListingTier, SupplierProduct } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { isSaleLive, supplierCommerceApi, validateTiers, type ListingPricingExtras, type SupplierPricingPatch, type SupplierProductWithPricing } from "@/lib/api/supplierCommerce";
import { useAsync, useDebounce, useFlash, type Flash } from "@/lib/hooks";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn, formatDate, formatNumber, formatSar, timeAgo, toDateTimeLocal } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LinkButton, LoadingBlock, PageHeader, Pagination, Select, Spinner, StatTile, Toggle } from "@/components/ui";
import { generatedImageUrl } from "@/components/shop/ProductCard";
import { RoleGuard } from "@/components/RoleGuard";

const STATUS_VALUES: ListingStatus[] = ["ACTIVE", "PAUSED", "OUT_OF_STOCK", "EXPIRED"];
const STATUS_META: Record<ListingStatus, { label: string; tone: "green" | "slate" | "red" | "amber" }> = {
  ACTIVE: { label: "Live", tone: "green" },
  PAUSED: { label: "Paused", tone: "slate" },
  OUT_OF_STOCK: { label: "Out of stock", tone: "red" },
  EXPIRED: { label: "Expired", tone: "amber" },
};
const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "EXPIRED", label: "Expired" },
];
const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "price", label: "Price" },
  { value: "stock", label: "Stock" },
];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type StatusFilter = ListingStatus | "";

function isListingStatus(value: string | null): value is ListingStatus {
  return value !== null && (STATUS_VALUES as string[]).includes(value);
}

/** Listing image with fallback to the generated SKU artwork; resets when the source changes (after upload / removal). */
function ListingImage({ src: initial, sku, alt, className }: { src: string; sku: string; alt: string; className?: string }) {
  const [src, setSrc] = useState(initial);
  useEffect(() => setSrc(initial), [initial]);
  const fallback = generatedImageUrl(sku);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn("h-full w-full object-cover", className)}
      onError={() => {
        if (src !== fallback) setSrc(fallback);
      }}
    />
  );
}

interface TierRow {
  minQty: string;
  price: string;
}

interface EditForm {
  price: string;
  stock: string;
  minQty: string;
  leadTimeDays: string;
  salePrice: string;
  saleEndsAt: string;
  tiers: TierRow[];
}

const MAX_TIERS = 10;

const formFor = (p: SupplierProductWithPricing): EditForm => ({
  price: String(p.price),
  stock: p.stock === null || p.stock === undefined ? "" : String(p.stock),
  minQty: String(p.minQty),
  leadTimeDays: String(p.leadTimeDays),
  salePrice: p.salePrice === null || p.salePrice === undefined ? "" : String(p.salePrice),
  saleEndsAt: toDateTimeLocal(p.saleEndsAt),
  tiers: (p.tiers ?? []).map((t) => ({ minQty: String(t.minQty), price: String(t.price) })),
});

/** Parses the tier rows; blank rows are dropped, half-filled rows are an error. */
function parseTiers(rows: TierRow[]): { tiers: ListingTier[]; error: string | null } {
  const tiers: ListingTier[] = [];
  for (const [i, row] of rows.entries()) {
    const q = row.minQty.trim();
    const pr = row.price.trim();
    if (!q && !pr) continue;
    if (!q || !pr) return { tiers, error: `Tier ${i + 1}: enter both a minimum quantity and a price.` };
    const minQty = Math.floor(Number(q));
    const price = Number(pr);
    if (!Number.isFinite(minQty) || !Number.isFinite(price)) return { tiers, error: `Tier ${i + 1}: quantity and price must be numbers.` };
    tiers.push({ minQty, price });
  }
  tiers.sort((a, b) => a.minQty - b.minQty);
  return { tiers, error: null };
}

const sameTiers = (a: ListingTier[], b: ListingTier[]) => a.length === b.length && a.every((t, i) => t.minQty === b[i].minQty && Math.abs(t.price - b[i].price) < 0.005);

const tiersLine = (tiers: ListingTier[], lang: Lang) => tiers.map((t) => `${formatNumber(t.minQty, lang)}+ ${formatSar(t.price, lang)}`).join(" · ");

function SupplierProductCard({
  product: p,
  onReplace,
  onPricingChange,
  onReload,
  onFlash,
}: {
  product: SupplierProductWithPricing;
  onReplace: (next: SupplierProductWithPricing) => void;
  onPricingChange: (listingId: string, extras: ListingPricingExtras) => void;
  onReload: () => void;
  onFlash: (flash: Flash) => void;
}) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => formFor(p));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = STATUS_META[p.status] ?? STATUS_META.ACTIVE;
  const name = lang === "ar" ? p.material.nameAr || p.material.name : p.material.name;
  const altName = lang === "ar" ? p.material.name : p.material.nameAr;
  const category = p.material.category ?? null;
  const categoryName = category ? (lang === "ar" ? category.nameAr || category.name : category.name) : null;
  const photoSource = p.imageUrl ? "Your photo" : p.material.imageUrl ? "Catalogue image" : "Auto-generated";
  const tracked = p.stock !== null && p.stock !== undefined;

  const startEdit = () => {
    setForm(formFor(p));
    setEditing(true);
  };
  const cancelEdit = () => {
    if (saving) return;
    setEditing(false);
  };

  const currentTiers: ListingTier[] = p.tiers ?? [];
  const saleLive = isSaleLive(p);
  const parsedTiers = parseTiers(form.tiers);
  const draftPrice = Number(form.price);
  const tiersHint = parsedTiers.error ?? (Number.isFinite(draftPrice) && draftPrice > 0 ? validateTiers(parsedTiers.tiers, draftPrice) : null);
  const updateTier = (index: number, patch: Partial<TierRow>) => setForm((f) => ({ ...f, tiers: f.tiers.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  const removeTier = (index: number) => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== index) }));
  const addTier = () => setForm((f) => (f.tiers.length >= MAX_TIERS ? f : { ...f, tiers: [...f.tiers, { minQty: "", price: "" }] }));

  const save = async () => {
    const patch: SupplierPricingPatch = {};
    const price = Number(form.price);
    if (!form.price.trim() || Number.isNaN(price) || price <= 0) {
      onFlash({ kind: "error", message: "Enter a valid price." });
      return;
    }
    if (price !== p.price) patch.price = price;

    const stock = form.stock.trim() === "" ? null : Math.floor(Number(form.stock));
    if (stock !== null && (Number.isNaN(stock) || stock < 0)) {
      onFlash({ kind: "error", message: "Stock must be a whole number (leave blank for not tracked)." });
      return;
    }
    if (stock !== (p.stock ?? null)) patch.stock = stock;

    const minQty = Math.floor(Number(form.minQty));
    if (!form.minQty.trim() || Number.isNaN(minQty) || minQty < 1) {
      onFlash({ kind: "error", message: "Minimum quantity must be at least 1." });
      return;
    }
    if (minQty !== p.minQty) patch.minQty = minQty;

    const leadTimeDays = Math.floor(Number(form.leadTimeDays));
    if (form.leadTimeDays.trim() === "" || Number.isNaN(leadTimeDays) || leadTimeDays < 0) {
      onFlash({ kind: "error", message: "Lead time must be zero or more days." });
      return;
    }
    if (leadTimeDays !== p.leadTimeDays) patch.leadTimeDays = leadTimeDays;

    // Sale price + end date
    const saleRaw = form.salePrice.trim();
    const salePrice = saleRaw === "" ? null : Number(saleRaw);
    if (salePrice !== null && (Number.isNaN(salePrice) || salePrice <= 0)) {
      onFlash({ kind: "error", message: "Enter a valid sale price or leave it blank." });
      return;
    }
    if (salePrice !== null && salePrice >= price) {
      onFlash({ kind: "error", message: "Sale price must be lower than the base price." });
      return;
    }
    let saleEndsAt: string | null = null;
    if (form.saleEndsAt.trim()) {
      const ends = new Date(form.saleEndsAt);
      if (Number.isNaN(ends.getTime())) {
        onFlash({ kind: "error", message: "Enter a valid sale end date." });
        return;
      }
      if (salePrice === null) {
        onFlash({ kind: "error", message: "Set a sale price, or clear the sale end date." });
        return;
      }
      if (ends.getTime() <= Date.now()) {
        onFlash({ kind: "error", message: "Sale end date must be in the future." });
        return;
      }
      saleEndsAt = ends.toISOString();
    }
    const currentSale = p.salePrice ?? null;
    const currentEnds = p.saleEndsAt ? new Date(p.saleEndsAt).getTime() : null;
    if (salePrice !== currentSale) patch.salePrice = salePrice;
    if (salePrice !== null && (saleEndsAt ? new Date(saleEndsAt).getTime() : null) !== currentEnds) patch.saleEndsAt = saleEndsAt;

    // Volume tiers
    if (parsedTiers.error) {
      onFlash({ kind: "error", message: parsedTiers.error });
      return;
    }
    const tierError = validateTiers(parsedTiers.tiers, price);
    if (tierError) {
      onFlash({ kind: "error", message: tierError });
      return;
    }
    const tiersChanged = !sameTiers(parsedTiers.tiers, currentTiers);

    if (Object.keys(patch).length === 0 && !tiersChanged) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // Order matters: the API validates the existing ladder against a new price and a new ladder against the
      // existing price, so save tiers first when the price goes down and last when it goes up.
      const priceDown = patch.price !== undefined && patch.price < p.price;
      let listing: Awaited<ReturnType<typeof supplierCommerceApi.updatePricing>> | null = null;
      if (tiersChanged && priceDown) listing = await supplierCommerceApi.replaceTiers(p.id, parsedTiers.tiers);
      if (Object.keys(patch).length) listing = await supplierCommerceApi.updatePricing(p.id, patch);
      if (tiersChanged && !priceDown) listing = await supplierCommerceApi.replaceTiers(p.id, parsedTiers.tiers);

      const extras: ListingPricingExtras = {
        salePrice: listing && listing.salePrice !== undefined ? listing.salePrice : salePrice,
        saleEndsAt: listing && listing.saleEndsAt !== undefined ? listing.saleEndsAt : salePrice === null ? null : saleEndsAt,
        tiers: listing?.tiers ?? parsedTiers.tiers,
      };
      onPricingChange(p.id, extras);
      onReplace({
        ...p,
        ...extras,
        price: listing?.price ?? price,
        stock: listing?.stock === undefined ? stock : listing.stock,
        minQty: listing?.minQty ?? minQty,
        leadTimeDays: listing?.leadTimeDays ?? leadTimeDays,
        validUntil: listing?.validUntil ?? p.validUntil,
        updatedAt: listing?.updatedAt ?? new Date().toISOString(),
      });
      setEditing(false);
      onFlash({ kind: "success", message: `${p.material.name} updated.` });
      onReload();
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const onEditKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const toggleActive = async (active: boolean) => {
    if (toggling) return;
    const previous = p;
    onReplace({ ...p, active, status: active ? (p.status === "PAUSED" ? "ACTIVE" : p.status) : "PAUSED" });
    setToggling(true);
    try {
      await api.updateSupplierPrice(p.id, { active });
      onFlash({ kind: "success", message: active ? `${p.material.name} is visible to buyers again.` : `${p.material.name} paused. Buyers no longer see this offer.` });
      onReload();
    } catch (err) {
      onReplace(previous);
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setToggling(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onFlash({ kind: "error", message: "Choose an image file (JPG, PNG or WebP)." });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      onFlash({ kind: "error", message: "Image is too large. Maximum size is 3 MB." });
      return;
    }
    setUploading(true);
    try {
      const updated = await api.uploadListingImage(p.id, file);
      onReplace({ ...p, ...updated });
      onFlash({ kind: "success", message: "Photo updated. Buyers now see your image." });
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (!window.confirm("Remove your photo? Buyers will see the catalogue image instead.")) return;
    setRemoving(true);
    try {
      const updated = await api.deleteListingImage(p.id);
      onReplace({ ...p, ...updated });
      onFlash({ kind: "success", message: "Photo removed." });
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setRemoving(false);
    }
  };

  const busyImage = uploading || removing;

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", p.status === "PAUSED" && "border-slate-200 bg-slate-50/40")}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <ListingImage src={p.displayImageUrl} sku={p.material.sku} alt={p.material.name} className={cn(p.status === "PAUSED" && "opacity-60")} />
        <div className="absolute start-2 top-2">
          <Badge tone={meta.tone} className="shadow-sm">{meta.label}</Badge>
        </div>
        {p.isCheapest && (
          <div className="absolute end-2 top-2">
            <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">Cheapest</span>
          </div>
        )}
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-end gap-1.5">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-label={`Upload photo for ${p.material.name}`} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busyImage}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-white/90 px-2.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-900/10 backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? <Spinner size="sm" /> : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            )}
            {uploading ? "Uploading…" : "Change photo"}
          </button>
          {p.imageUrl && (
            <button
              type="button"
              onClick={removePhoto}
              disabled={busyImage}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-white/90 px-2.5 text-xs font-medium text-red-600 shadow-sm ring-1 ring-slate-900/10 backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {removing && <Spinner size="sm" className="text-current" />}
              Remove photo
            </button>
          )}
        </div>
      </div>
      <p className="border-b border-slate-100 px-4 py-1.5 text-[11px] text-slate-500">{photoSource}</p>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{name}</h3>
            <Badge tone="blue">{p.city}</Badge>
          </div>
          {altName && <p dir={lang === "ar" ? "ltr" : "rtl"} className="mt-0.5 truncate text-xs text-slate-500">{altName}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
            {category && (
              <span>
                {category.icon ? `${category.icon} ` : ""}
                {categoryName}
              </span>
            )}
            {category && p.material.brand && <span aria-hidden>·</span>}
            {p.material.brand && <span>{p.material.brand}</span>}
            <span aria-hidden>·</span>
            <span>per {p.material.unit}</span>
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{p.material.sku}</p>
        </div>

        {p.isCheapest ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden>
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Cheapest in {p.city}
          </p>
        ) : p.competitors === 0 ? (
          <p className="text-xs font-medium text-slate-500">Only you sell this here</p>
        ) : (
          <p className="text-xs font-medium text-amber-700">
            Best competitor <span className="tabular-nums">{formatSar(p.bestCompetitorPrice, lang)}</span> · {p.competitors} other {p.competitors === 1 ? "supplier" : "suppliers"}
          </p>
        )}

        {editing ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input label="Price (SAR)" name={`price-${p.id}`} type="number" min={0} step="0.01" dir="ltr" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} onKeyDown={onEditKey} autoFocus disabled={saving} />
              <Input label="Stock" name={`stock-${p.id}`} type="number" min={0} step={1} dir="ltr" placeholder="Not tracked" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} onKeyDown={onEditKey} disabled={saving} />
              <Input label="Min qty" name={`minQty-${p.id}`} type="number" min={1} step={1} dir="ltr" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} onKeyDown={onEditKey} disabled={saving} />
              <Input label="Lead time (days)" name={`lead-${p.id}`} type="number" min={0} step={1} dir="ltr" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} onKeyDown={onEditKey} disabled={saving} />
            </div>

            <div className="mt-3 border-t border-brand-100 pt-3">
              <p className="text-xs font-semibold text-slate-700">Sale</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Input label="Sale price (SAR)" name={`sale-${p.id}`} type="number" min={0} step="0.01" dir="ltr" placeholder="No sale" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} onKeyDown={onEditKey} disabled={saving} />
                <Input label="Sale ends" name={`saleEnds-${p.id}`} type="datetime-local" dir="ltr" value={form.saleEndsAt} onChange={(e) => setForm({ ...form, saleEndsAt: e.target.value })} onKeyDown={onEditKey} disabled={saving || !form.salePrice.trim()} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Must be below the base price. Leave the end date blank for an open-ended sale; clear the sale price to end it.</p>
            </div>

            <div className="mt-3 border-t border-brand-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">Quantity tiers</p>
                <Button size="sm" variant="ghost" onClick={addTier} disabled={saving || form.tiers.length >= MAX_TIERS}>+ Add tier</Button>
              </div>
              {form.tiers.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate-500">No volume discounts. Add a tier to offer a lower unit price from a minimum quantity.</p>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-[11px] font-medium text-slate-500">
                    <span>From qty ({p.material.unit})</span>
                    <span>Unit price (SAR)</span>
                    <span />
                  </div>
                  {form.tiers.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
                      <Input name={`tier-qty-${p.id}-${i}`} aria-label={`Tier ${i + 1} minimum quantity`} type="number" min={2} step={1} dir="ltr" placeholder="e.g. 50" value={row.minQty} onChange={(e) => updateTier(i, { minQty: e.target.value })} onKeyDown={onEditKey} disabled={saving} />
                      <Input name={`tier-price-${p.id}-${i}`} aria-label={`Tier ${i + 1} price`} type="number" min={0} step="0.01" dir="ltr" placeholder="e.g. 27.50" value={row.price} onChange={(e) => updateTier(i, { price: e.target.value })} onKeyDown={onEditKey} disabled={saving} />
                      <button type="button" onClick={() => removeTier(i)} disabled={saving} aria-label={`Remove tier ${i + 1}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                      </button>
                    </div>
                  ))}
                  {tiersHint ? (
                    <p className="text-[11px] text-red-600">{tiersHint}</p>
                  ) : parsedTiers.tiers.length > 0 ? (
                    <p className="text-[11px] text-emerald-700">Buyers will see: {tiersLine(parsedTiers.tiers, lang)}</p>
                  ) : null}
                  <p className="text-[11px] text-slate-500">Quantities ascending (above 1), each price lower than the previous one and below the base price. Max {MAX_TIERS} tiers.</p>
                </div>
              )}
            </div>

            <p className="mt-2 text-[11px] text-slate-500">Leave stock blank if you do not track it. Enter saves, Escape cancels.</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>{t("common.cancel")}</Button>
              <Button size="sm" onClick={save} loading={saving}>{t("common.save")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <dt className="flex items-center gap-1.5 text-slate-500">
                    Price
                    {saleLive && <Badge tone="red" className="px-1.5 py-0 text-[10px]">Sale</Badge>}
                  </dt>
                  {saleLive ? (
                    <dd>
                      <span className="text-base font-bold tabular-nums text-red-600">{formatSar(p.salePrice ?? p.price, lang)}</span>
                      <span className="ms-1.5 text-xs tabular-nums text-slate-400 line-through" dir="ltr">{formatSar(p.price, lang)}</span>
                      <span className="ms-1 text-[11px] font-normal text-slate-500">/ {p.material.unit}</span>
                      <p className="text-[11px] text-slate-500">{p.saleEndsAt ? `Ends ${formatDate(p.saleEndsAt, lang)}` : "No end date"}</p>
                    </dd>
                  ) : (
                    <dd className="text-base font-bold tabular-nums text-brand-700">{formatSar(p.price, lang)}<span className="ms-1 text-[11px] font-normal text-slate-500">/ {p.material.unit}</span></dd>
                  )}
                </div>
                <div>
                  <dt className="text-slate-500">Stock</dt>
                  <dd className={cn("font-semibold tabular-nums", tracked && (p.stock ?? 0) <= 0 ? "text-red-700" : "text-slate-900")}>{tracked ? `${formatNumber(p.stock, lang)} ${p.material.unit}` : <span className="font-normal text-slate-500">Not tracked</span>}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Min qty</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{formatNumber(p.minQty, lang)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lead time</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{p.leadTimeDays} {p.leadTimeDays === 1 ? "day" : "days"}</dd>
                </div>
              </dl>
              <Button size="sm" variant="outline" onClick={startEdit}>Edit</Button>
            </div>
            {currentTiers.length > 0 && (
              <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600" title="Volume pricing shown to buyers">
                <span className="font-medium text-slate-700">Volume:</span> <span className="tabular-nums">{tiersLine(currentTiers, lang)}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>Sold last 30 days: <span className="font-semibold tabular-nums text-slate-900">{formatNumber(p.sold30d, lang)}</span> {p.material.unit}</span>
          <span title={p.updatedAt}>Updated {timeAgo(p.updatedAt)}</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
            <Toggle checked={p.active} onChange={toggleActive} disabled={toggling} label="Visible to buyers" />
            Visible to buyers
          </label>
          <div className="flex items-center gap-3 text-xs font-medium">
            <a href={`/shop/products/${p.materialId}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">View in shop ↗</a>
            <Link href="/supplier/inventory" className="text-slate-600 hover:text-brand-700 hover:underline">Stock movements</Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SupplierProductsInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 350);
  const [status, setStatus] = useState<StatusFilter>(() => {
    const initial = params.get("status");
    return isListingStatus(initial) ? initial : "";
  });
  const [city, setCity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useFlash(6000);

  const categories = useAsync(() => api.categories(), []);
  const state = useAsync(
    () => api.supplierProducts({ q: dq.trim() || undefined, status: status || undefined, city: city || undefined, categoryId: categoryId || undefined, sort, page }),
    [dq, status, city, categoryId, sort, page],
  );
  // The "My products" rows do not carry sale / tier fields; the raw listings do. Load them once and merge by listing id.
  const pricing = useAsync(() => supplierCommerceApi.listingPricingMap(), []);
  const [pricingOverrides, setPricingOverrides] = useState<Record<string, ListingPricingExtras>>({});
  const onPricingChange = (listingId: string, extras: ListingPricingExtras) => setPricingOverrides((prev) => ({ ...prev, [listingId]: extras }));

  const pickStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };
  const replaceProduct = (next: SupplierProduct) =>
    state.setData((prev) => (prev ? { ...prev, data: prev.data.map((row) => (row.id === next.id ? next : row)) } : prev));

  const summary = state.data?.summary;
  const rows: SupplierProductWithPricing[] = (state.data?.data ?? []).map((raw) => {
    const row = raw as SupplierProductWithPricing;
    const extras = pricingOverrides[row.id] ?? (row.tiers !== undefined || row.salePrice !== undefined ? { salePrice: row.salePrice ?? null, saleEndsAt: row.saleEndsAt ?? null, tiers: row.tiers ?? [] } : pricing.data?.get(row.id) ?? {});
    return { ...row, ...extras };
  });
  const filtersActive = Boolean(dq.trim() || status || city || categoryId);
  const noProductsAtAll = !state.loading && !state.error && summary !== undefined && summary.total === 0;
  const clearFilters = () => {
    setQ("");
    setCity("");
    setCategoryId("");
    setSort("updated");
    pickStatus("");
  };

  const actions = (
    <>
      <LinkButton href="/supplier/reviews" variant="ghost">Reviews &amp; questions</LinkButton>
      <LinkButton href="/supplier/catalog" variant="outline">Sell a new product</LinkButton>
      <LinkButton href="/supplier/prices" variant="primary">+ Add product / price</LinkButton>
    </>
  );

  const tile = (label: string, value: React.ReactNode, filter: StatusFilter, opts: { sub?: string; tone?: "default" | "brand" | "amber" } = {}) => {
    const selected = status === filter;
    return (
      <button
        type="button"
        onClick={() => pickStatus(filter)}
        aria-pressed={selected}
        className={cn("rounded-xl text-start transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2", selected ? "ring-2 ring-brand-600 ring-offset-2" : "hover:-translate-y-0.5")}
        title={filter ? `Show ${label.toLowerCase()} products` : "Show all products"}
      >
        <StatTile label={label} value={value} sub={opts.sub} tone={opts.tone} className="h-full" />
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title={t("sup.products")}
        subtitle="Everything you sell on MySupplier, exactly as buyers see it. Edit price and stock inline, pause an offer, or add a photo."
        action={actions}
      />
      <FlashMessage flash={flash} className="mb-4" />

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {tile("Total products", formatNumber(summary.total, lang), "")}
          {tile("Active", formatNumber(summary.active, lang), "ACTIVE", { tone: "brand" })}
          <StatTile label="Cheapest in city" value={formatNumber(summary.cheapest, lang)} sub="offers where you beat every competitor" className="h-full" />
          {tile("Paused", formatNumber(summary.paused, lang), "PAUSED")}
          {tile("Out of stock", formatNumber(summary.outOfStock, lang), "OUT_OF_STOCK", { tone: summary.outOfStock > 0 ? "amber" : "default" })}
          {tile("Expired", formatNumber(summary.expired, lang), "EXPIRED", { tone: summary.expired > 0 ? "amber" : "default" })}
        </div>
      )}

      {!noProductsAtAll && (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Input name="q" placeholder="Search name, SKU, brand…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="sm:col-span-2" aria-label="Search products" />
            <Select name="status" aria-label="Status" value={status} onChange={(e) => pickStatus(e.target.value as StatusFilter)} placeholder="All statuses" options={STATUS_OPTIONS} />
            <Select name="city" aria-label={t("common.city")} value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} placeholder="All cities" options={(state.data?.cities ?? (city ? [city] : [])).map((c) => ({ value: c, label: c }))} />
            <Select name="category" aria-label="Category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} placeholder="All categories" options={(categories.data ?? []).map((c) => ({ value: c.id, label: `${c.icon ? `${c.icon} ` : ""}${lang === "ar" ? c.nameAr || c.name : c.name}` }))} />
            <Select name="sort" aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} options={SORT_OPTIONS} />
          </div>
        </Card>
      )}

      {state.loading && !state.data ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : noProductsAtAll ? (
        <Card>
          <EmptyState
            title="No products yet"
            description="Publish a price for a catalogue material to start selling it, or list a product that is not in the catalogue yet. Every published price appears here and in the shop."
            action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No products match these filters"
            description={filtersActive ? "Try a different search, status, city or category." : "Nothing to show on this page."}
            action={filtersActive ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", state.loading && "opacity-60 transition")} aria-busy={state.loading}>
            {rows.map((p) => (
              <SupplierProductCard key={p.id} product={p} onReplace={replaceProduct} onPricingChange={onPricingChange} onReload={state.reload} onFlash={setFlash} />
            ))}
          </div>
          {state.data && state.data.total > state.data.pageSize && (
            <Card className="mt-4">
              <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={(next) => { setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function SupplierProductsPage() {
  return (
    <RoleGuard area="sell">
      <Suspense fallback={<LoadingBlock />}>
        <SupplierProductsInner />
      </Suspense>
    </RoleGuard>
  );
}
