"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, type Category } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Button, Card, EmptyState, Input, LoadingBlock, Pagination, Select } from "@/components/ui";
import { ProductCard } from "@/components/shop/ProductCard";

const SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
];

const PAGE_SIZE = 24;

function CategoryTree({ categories, selected, onSelect, lang }: { categories: Category[]; selected: string; onSelect: (id: string) => void; lang: "en" | "ar" }) {
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
  // Flat lists (no parentId anywhere) still render as one level.
  const topLevel = roots.length > 0 ? roots : categories;
  const label = (c: Category) => (lang === "ar" ? c.nameAr : c.name);

  const item = (c: Category, depth: number) => (
    <li key={c.id}>
      <button
        type="button"
        onClick={() => onSelect(c.id === selected ? "" : c.id)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start text-sm hover:bg-slate-100",
          c.id === selected ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600",
        )}
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

function ProductsInner() {
  const { t, lang } = useI18n();
  usePageTitle(t("shop.allProducts"));
  const router = useRouter();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const categoryId = params.get("categoryId") ?? "";
  const city = params.get("city") ?? "";
  const brand = params.get("brand") ?? "";
  const minPrice = params.get("minPrice") ?? "";
  const maxPrice = params.get("maxPrice") ?? "";
  const inStock = params.get("inStock") === "1";
  const sort = params.get("sort") ?? "relevance";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [search, setSearch] = useState(q);
  const [priceMin, setPriceMin] = useState(minPrice);
  const [priceMax, setPriceMax] = useState(maxPrice);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => setPriceMin(minPrice), [minPrice]);
  useEffect(() => setPriceMax(maxPrice), [maxPrice]);

  const update = (patch: Record<string, string | number | boolean | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === "" || v === null || v === false) next.delete(k);
      else next.set(k, v === true ? "1" : String(v));
    });
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/shop/products?${qs}` : "/shop/products");
  };

  const categories = useAsync(() => api.categories(), []);
  const brands = useAsync(() => api.shopBrands(), []);
  const products = useAsync(
    () =>
      api.shopProducts({
        q,
        categoryId,
        city,
        brand,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        inStock: inStock ? 1 : undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      }),
    [q, categoryId, city, brand, minPrice, maxPrice, inStock, sort, page],
  );

  const activeFilters = [q, categoryId, city, brand, minPrice, maxPrice, inStock ? "1" : ""].filter(Boolean).length;
  const brandList = brands.data ?? [];
  const visibleBrands = showAllBrands ? brandList : brandList.slice(0, 12);
  const selectedCategory = (categories.data ?? []).find((c) => c.id === categoryId);

  const applyPrice = () => update({ minPrice: priceMin.trim(), maxPrice: priceMax.trim() });

  const filters = (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("materials.category")}</h3>
        {categories.loading ? (
          <LoadingBlock className="py-4" />
        ) : categories.error ? (
          <Alert onRetry={categories.reload}>{categories.error}</Alert>
        ) : (
          <div className="max-h-72 overflow-y-auto pe-1">
            <CategoryTree categories={categories.data ?? []} selected={categoryId} onSelect={(id) => update({ categoryId: id })} lang={lang} />
          </div>
        )}
      </div>
      <Select label={t("materials.city")} name="city" value={city} onChange={(e) => update({ city: e.target.value })} placeholder={t("materials.allCities")} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</h3>
        {brands.loading ? (
          <LoadingBlock className="py-3" />
        ) : brands.error ? (
          <p className="text-xs text-slate-400">Brands unavailable</p>
        ) : brandList.length === 0 ? (
          <p className="text-xs text-slate-400">No brands yet</p>
        ) : (
          <ul className="space-y-1">
            {visibleBrands.map((b) => (
              <li key={b}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input type="radio" name="brand" checked={brand === b} onChange={() => update({ brand: b })} className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-600" />
                  <span className="truncate">{b}</span>
                </label>
              </li>
            ))}
            {brandList.length > 12 && (
              <li>
                <button type="button" onClick={() => setShowAllBrands((v) => !v)} className="text-xs font-semibold text-brand-700 hover:underline">
                  {showAllBrands ? "Show fewer" : `Show all ${brandList.length}`}
                </button>
              </li>
            )}
            {brand && (
              <li>
                <button type="button" onClick={() => update({ brand: "" })} className="text-xs text-slate-500 hover:underline">
                  Clear brand
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Price (SAR)</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyPrice();
          }}
        >
          <Input name="minPrice" type="number" min={0} placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} dir="ltr" aria-label="Minimum price" />
          <span className="text-slate-400">–</span>
          <Input name="maxPrice" type="number" min={0} placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} dir="ltr" aria-label="Maximum price" />
          <Button type="submit" size="sm" variant="outline">
            Go
          </Button>
        </form>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
        <span>{t("shop.inStock")} only</span>
        <input type="checkbox" checked={inStock} onChange={(e) => update({ inStock: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
      </label>
      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push("/shop/products")}>
          Clear all filters ({activeFilters})
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-3 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:text-brand-700">
          {t("nav.shop")}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{selectedCategory ? (lang === "ar" ? selectedCategory.nameAr : selectedCategory.name) : t("shop.allProducts")}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{selectedCategory ? (lang === "ar" ? selectedCategory.nameAr : selectedCategory.name) : t("shop.allProducts")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {products.data ? `${products.data.total} ${t("materials.results")}` : " "}
            {q && <> for “{q}”</>}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() });
          }}
          className="flex w-full gap-2 sm:w-auto"
        >
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("nav.searchPlaceholder")} className="flex-1 sm:w-80" />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside>
          <div className="mb-3 lg:hidden">
            <Button variant="outline" className="w-full" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
              {t("materials.filters")}
              {activeFilters > 0 ? ` (${activeFilters})` : ""}
            </Button>
          </div>
          <Card className={cn("p-4", !filtersOpen && "hidden lg:block")}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("materials.filters")}</h2>
            {filters}
          </Card>
        </aside>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-card">
            <span className="text-sm text-slate-600">
              {products.loading ? "Loading…" : products.data ? `${products.data.total} ${t("materials.results")}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">{t("materials.sort")}</span>
              <Select name="sort" value={sort} onChange={(e) => update({ sort: e.target.value })} options={SORTS} className="w-48" aria-label={t("materials.sort")} />
            </div>
          </div>
          {products.loading ? (
            <LoadingBlock className="min-h-[40vh]" />
          ) : products.error ? (
            <Alert onRetry={products.reload}>{products.error}</Alert>
          ) : !products.data || products.data.data.length === 0 ? (
            <Card>
              <EmptyState
                title="No products found"
                description="Try a different search term or clear some filters."
                action={
                  activeFilters > 0 ? (
                    <Button variant="outline" onClick={() => router.push("/shop/products")}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {products.data.data.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <Card className="mt-4">
                <Pagination page={products.data.page} pageSize={products.data.pageSize} total={products.data.total} onChange={(p) => update({ page: p })} />
              </Card>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ShopProductsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ProductsInner />
    </Suspense>
  );
}
