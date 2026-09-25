"use client";

import { useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, type AttributeFacet, type Category, type ProductFacets } from "@mysupplier/shared";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar } from "@/lib/format";
import { Button, Input, Select, Stars } from "@/components/ui";

// ---------------------------------------------------------------------------
// URL <-> filter state
// ---------------------------------------------------------------------------

export interface ListingFilters {
  q: string;
  categoryId: string;
  city: string;
  /** Selected brands (OR). */
  brands: string[];
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  minRating: string;
  sort: string;
  page: number;
  view: "grid" | "list";
  /** spec.<key> raw values ("a,b" or "min..max"). */
  specs: Record<string, string>;
}

export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
];

export function parseFilters(params: URLSearchParams): ListingFilters {
  const specs: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith("spec.") && value) specs[key.slice(5)] = value;
  });
  return {
    q: params.get("q") ?? "",
    categoryId: params.get("categoryId") ?? "",
    city: params.get("city") ?? "",
    brands: (params.get("brand") ?? "").split(",").map((b) => b.trim()).filter(Boolean),
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    inStock: params.get("inStock") === "1",
    minRating: params.get("minRating") ?? "",
    sort: params.get("sort") ?? "relevance",
    page: Math.max(1, Number(params.get("page") ?? "1") || 1),
    view: params.get("view") === "list" ? "list" : "grid",
    specs,
  };
}

/** Number of user-chosen filters (excludes sort/page/view). */
export function countActiveFilters(f: ListingFilters, ignoreBrand = false): number {
  return [f.q, f.categoryId, f.city, ignoreBrand ? "" : f.brands.length ? "1" : "", f.minPrice || f.maxPrice, f.inStock ? "1" : "", f.minRating].filter(Boolean).length + Object.keys(f.specs).length;
}

export type FilterPatch = Partial<Record<string, string | number | boolean | undefined | null>>;

// ---------------------------------------------------------------------------
// Category tree
// ---------------------------------------------------------------------------

export function CategoryTree({ categories, selected, onSelect, lang }: { categories: Category[]; selected: string; onSelect: (id: string) => void; lang: "en" | "ar" }) {
  const byParent = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    categories.forEach((c) => {
      const key = c.parentId ?? null;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    });
    return map;
  }, [categories]);
  const roots = byParent.get(null) ?? [];
  const topLevel = roots.length > 0 ? roots : categories;
  const label = (c: Category) => (lang === "ar" ? c.nameAr : c.name);

  const item = (c: Category, depth: number) => (
    <li key={c.id}>
      <button
        type="button"
        onClick={() => onSelect(c.id === selected ? "" : c.id)}
        className={cn("flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start text-sm hover:bg-slate-100", c.id === selected ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600")}
        style={{ paddingInlineStart: `${8 + depth * 12}px` }}
        aria-pressed={c.id === selected}
      >
        <span className="truncate">
          {c.icon && <span className="me-1.5">{c.icon}</span>}
          {label(c)}
        </span>
        {typeof c.materialCount === "number" && <span className="ms-2 text-xs text-slate-400">{c.materialCount}</span>}
      </button>
      {(byParent.get(c.id) ?? []).length > 0 && <ul>{(byParent.get(c.id) ?? []).map((child) => item(child, depth + 1))}</ul>}
    </li>
  );

  return <ul className="space-y-0.5">{topLevel.map((c) => item(c, 0))}</ul>;
}

// ---------------------------------------------------------------------------
// Facet groups
// ---------------------------------------------------------------------------

function FacetGroup({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="mb-2 flex w-full items-center justify-between text-start" aria-expanded={open}>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4 text-slate-400 transition", open && "rotate-180")} aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}

function CheckList({ name, options, selected, onToggle, max = 8 }: { name: string; options: { value: string; count: number; label?: string }[]; selected: string[]; onToggle: (value: string) => void; max?: number }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.slice(0, max);
  const norm = (v: string) => v.toLowerCase();
  const sel = new Set(selected.map(norm));
  if (options.length === 0) return <p className="text-xs text-slate-400">No options</p>;
  return (
    <ul className="space-y-1">
      {visible.map((o) => (
        <li key={o.value}>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name={name} checked={sel.has(norm(o.value))} onChange={() => onToggle(o.value)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            <span className="min-w-0 flex-1 truncate">{o.label ?? o.value}</span>
            <span className="text-xs tabular-nums text-slate-400">{o.count}</span>
          </label>
        </li>
      ))}
      {options.length > max && (
        <li>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-brand-700 hover:underline">
            {showAll ? "Show fewer" : `Show all ${options.length}`}
          </button>
        </li>
      )}
    </ul>
  );
}

function RangeInputs({ id, min, max, unit, initialMin, initialMax, onApply, placeholderMin, placeholderMax }: { id: string; min?: number | null; max?: number | null; unit?: string | null; initialMin: string; initialMax: string; onApply: (min: string, max: string) => void; placeholderMin?: string; placeholderMax?: string }) {
  const [lo, setLo] = useState(initialMin);
  const [hi, setHi] = useState(initialMax);
  useEffect(() => setLo(initialMin), [initialMin]);
  useEffect(() => setHi(initialMax), [initialMax]);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(lo.trim(), hi.trim());
      }}
    >
      <Input id={`${id}-min`} type="number" step="any" min={0} placeholder={placeholderMin ?? (min !== null && min !== undefined ? String(min) : "Min")} value={lo} onChange={(e) => setLo(e.target.value)} dir="ltr" aria-label={`Minimum ${id}`} />
      <span className="text-slate-400">–</span>
      <Input id={`${id}-max`} type="number" step="any" min={0} placeholder={placeholderMax ?? (max !== null && max !== undefined ? String(max) : "Max")} value={hi} onChange={(e) => setHi(e.target.value)} dir="ltr" aria-label={`Maximum ${id}`} />
      {unit && <span className="text-xs text-slate-500">{unit}</span>}
      <Button type="submit" size="sm" variant="outline" aria-label={`Apply ${id} range`}>
        Go
      </Button>
    </form>
  );
}

function splitRange(raw: string): [string, string] {
  const m = raw.match(/^(.*?)\.\.(.*)$/);
  return m ? [m[1], m[2]] : ["", ""];
}

function AttributeFacetGroup({ facet, value, lang, onChange }: { facet: AttributeFacet; value: string; lang: "en" | "ar"; onChange: (next: string) => void }) {
  const label = lang === "ar" ? facet.labelAr || facet.label : facet.label;
  const title = facet.unit ? `${label} (${facet.unit})` : label;
  if (facet.type === "NUMBER") {
    const [lo, hi] = splitRange(value);
    return (
      <FacetGroup title={title}>
        <RangeInputs id={facet.key} min={facet.min} max={facet.max} initialMin={lo} initialMax={hi} onApply={(a, b) => onChange(a || b ? `${a}..${b}` : "")} />
        {facet.min !== null && facet.min !== undefined && facet.max !== null && facet.max !== undefined && (
          <p className="mt-1 text-[11px] text-slate-400">
            Range {facet.min} – {facet.max}
            {facet.unit ? ` ${facet.unit}` : ""}
          </p>
        )}
      </FacetGroup>
    );
  }
  const selected = value.split(",").map((v) => v.trim()).filter(Boolean);
  const options = (facet.values ?? []).map((v) => ({ ...v, label: facet.type === "BOOLEAN" ? (/^(true|1|yes)$/i.test(v.value) ? "Yes" : /^(false|0|no)$/i.test(v.value) ? "No" : v.value) : v.value }));
  return (
    <FacetGroup title={title}>
      <CheckList
        name={`spec-${facet.key}`}
        options={options}
        selected={selected}
        onToggle={(v) => {
          const has = selected.some((s) => s.toLowerCase() === v.toLowerCase());
          const next = has ? selected.filter((s) => s.toLowerCase() !== v.toLowerCase()) : [...selected, v];
          onChange(next.join(","));
        }}
      />
    </FacetGroup>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function FacetSidebar({
  filters,
  facets,
  categories,
  categoriesLoading,
  hideBrands,
  onChange,
  onClear,
}: {
  filters: ListingFilters;
  facets: ProductFacets | null;
  categories: Category[];
  categoriesLoading?: boolean;
  hideBrands?: boolean;
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}) {
  const { t, lang } = useI18n();
  const active = countActiveFilters(filters, hideBrands);
  const brandOptions = facets?.brands ?? [];
  const toggleBrand = (b: string) => {
    const has = filters.brands.some((x) => x.toLowerCase() === b.toLowerCase());
    const next = has ? filters.brands.filter((x) => x.toLowerCase() !== b.toLowerCase()) : [...filters.brands, b];
    onChange({ brand: next.join(",") });
  };

  return (
    <div className="space-y-4">
      <FacetGroup title={t("materials.category")}>
        {categoriesLoading ? (
          <p className="py-2 text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="max-h-72 overflow-y-auto pe-1">
            <CategoryTree categories={categories} selected={filters.categoryId} onSelect={(id) => onSelect(id)} lang={lang} />
          </div>
        )}
      </FacetGroup>

      <FacetGroup title="Availability">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-700">
          <span>{t("shop.inStock")} only</span>
          <input type="checkbox" checked={filters.inStock} onChange={(e) => onChange({ inStock: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
        </label>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <Stars value={4} /> &amp; up
          </span>
          <input type="checkbox" checked={filters.minRating === "4"} onChange={(e) => onChange({ minRating: e.target.checked ? "4" : "" })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
        </label>
      </FacetGroup>

      <FacetGroup title="Price (SAR)">
        <RangeInputs id="price" min={facets?.price.min ?? null} max={facets?.price.max ?? null} initialMin={filters.minPrice} initialMax={filters.maxPrice} onApply={(a, b) => onChange({ minPrice: a, maxPrice: b })} />
        {facets?.price.min !== null && facets?.price.min !== undefined && facets?.price.max !== null && facets?.price.max !== undefined && (
          <p className="mt-1 text-[11px] text-slate-400">
            {formatSar(facets.price.min, lang)} – {formatSar(facets.price.max, lang)}
          </p>
        )}
      </FacetGroup>

      {!hideBrands && (
        <FacetGroup title="Brand">
          <CheckList name="brand" options={brandOptions} selected={filters.brands} onToggle={toggleBrand} />
        </FacetGroup>
      )}

      {(facets?.attributes ?? []).map((facet) => (
        <AttributeFacetGroup key={facet.key} facet={facet} value={filters.specs[facet.key] ?? ""} lang={lang} onChange={(next) => onChange({ [`spec.${facet.key}`]: next })} />
      ))}

      <FacetGroup title={t("materials.city")} defaultOpen={!!filters.city}>
        <Select name="city" value={filters.city} onChange={(e) => onChange({ city: e.target.value })} placeholder={t("materials.allCities")} options={(facets?.cities.length ? facets.cities.map((c) => ({ value: c.value, label: `${c.value} (${c.count})` })) : SAUDI_CITIES.map((c) => ({ value: c, label: c })))} aria-label={t("materials.city")} />
      </FacetGroup>

      {active > 0 && (
        <Button variant="ghost" size="sm" className="w-full" onClick={onClear}>
          Clear all filters ({active})
        </Button>
      )}
    </div>
  );

  function onSelect(id: string) {
    // Changing category invalidates spec filters that belong to the old category.
    const clear: FilterPatch = { categoryId: id };
    Object.keys(filters.specs).forEach((k) => (clear[`spec.${k}`] = ""));
    onChange(clear);
  }
}

// ---------------------------------------------------------------------------
// Active filter chips
// ---------------------------------------------------------------------------

export function ActiveFilterChips({ filters, facets, categories, hideBrands, onChange, onClear }: { filters: ListingFilters; facets: ProductFacets | null; categories: Category[]; hideBrands?: boolean; onChange: (patch: FilterPatch) => void; onClear: () => void }) {
  const { lang } = useI18n();
  const chips: { key: string; label: string; patch: FilterPatch }[] = [];
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”`, patch: { q: "" } });
  if (filters.categoryId) {
    const c = categories.find((x) => x.id === filters.categoryId);
    chips.push({ key: "cat", label: c ? (lang === "ar" ? c.nameAr : c.name) : "Category", patch: { categoryId: "" } });
  }
  if (filters.city) chips.push({ key: "city", label: filters.city, patch: { city: "" } });
  if (!hideBrands) filters.brands.forEach((b) => chips.push({ key: `brand-${b}`, label: b, patch: { brand: filters.brands.filter((x) => x !== b).join(",") } }));
  if (filters.minPrice || filters.maxPrice) chips.push({ key: "price", label: `SAR ${filters.minPrice || "0"} – ${filters.maxPrice || "∞"}`, patch: { minPrice: "", maxPrice: "" } });
  if (filters.inStock) chips.push({ key: "stock", label: "In stock", patch: { inStock: false } });
  if (filters.minRating) chips.push({ key: "rating", label: `${filters.minRating}★ & up`, patch: { minRating: "" } });
  Object.entries(filters.specs).forEach(([key, value]) => {
    const def = facets?.attributes.find((a) => a.key === key);
    const label = def ? (lang === "ar" ? def.labelAr || def.label : def.label) : key;
    const [lo, hi] = splitRange(value);
    const pretty = value.includes("..") ? `${lo || "0"} – ${hi || "∞"}${def?.unit ? ` ${def.unit}` : ""}` : value.split(",").join(", ");
    chips.push({ key: `spec-${key}`, label: `${label}: ${pretty}`, patch: { [`spec.${key}`]: "" } });
  });
  if (chips.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={() => onChange(c.patch)} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100" aria-label={`Remove filter ${c.label}`}>
          {c.label}
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">
          Clear all
        </button>
      )}
    </div>
  );
}
