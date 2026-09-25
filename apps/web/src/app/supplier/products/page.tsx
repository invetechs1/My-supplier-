"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useRef, useState } from "react";
import type { ListingStatus, SupplierProduct, SupplierProductPatch } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useDebounce, useFlash, type Flash } from "@/lib/hooks";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn, formatNumber, formatSar, timeAgo } from "@/lib/format";
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

interface EditForm {
  price: string;
  stock: string;
  minQty: string;
  leadTimeDays: string;
}

const formFor = (p: SupplierProduct): EditForm => ({
  price: String(p.price),
  stock: p.stock === null || p.stock === undefined ? "" : String(p.stock),
  minQty: String(p.minQty),
  leadTimeDays: String(p.leadTimeDays),
});

function SupplierProductCard({
  product: p,
  lang,
  t,
  onReplace,
  onReload,
  onFlash,
}: {
  product: SupplierProduct;
  lang: Lang;
  t: (key: string) => string;
  onReplace: (next: SupplierProduct) => void;
  onReload: () => void;
  onFlash: (flash: Flash) => void;
}) {
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

  const save = async () => {
    const patch: SupplierProductPatch = {};
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

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateSupplierPrice(p.id, patch);
      onReplace({
        ...p,
        price: updated.price ?? price,
        stock: updated.stock === undefined ? stock : updated.stock,
        minQty: updated.minQty ?? minQty,
        leadTimeDays: updated.leadTimeDays ?? leadTimeDays,
        validUntil: updated.validUntil ?? p.validUntil,
        updatedAt: updated.updatedAt ?? new Date().toISOString(),
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
                  <dt className="text-slate-500">Price</dt>
                  <dd className="text-base font-bold tabular-nums text-brand-700">{formatSar(p.price, lang)}<span className="ms-1 text-[11px] font-normal text-slate-500">/ {p.material.unit}</span></dd>
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

  const pickStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };
  const replaceProduct = (next: SupplierProduct) =>
    state.setData((prev) => (prev ? { ...prev, data: prev.data.map((row) => (row.id === next.id ? next : row)) } : prev));

  const summary = state.data?.summary;
  const rows = state.data?.data ?? [];
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
              <SupplierProductCard key={p.id} product={p} lang={lang} t={t} onReplace={replaceProduct} onReload={state.reload} onFlash={setFlash} />
            ))}
          </div>
          {state.data && (
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
