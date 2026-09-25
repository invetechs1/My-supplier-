"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { marketplaceApi } from "@/lib/api/marketplace";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Button, Card, EmptyState, Input, LoadingBlock, Pagination, Select } from "@/components/ui";
import { ProductCard } from "./ProductCard";
import { ActiveFilterChips, FacetSidebar, SORT_OPTIONS, countActiveFilters, parseFilters, type FilterPatch } from "./Facets";

const PAGE_SIZE = 24;
const VIEW_KEY = "ms_shop_view";

function readStoredView(): "grid" | "list" | null {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === "list" || v === "grid" ? v : null;
  } catch {
    return null;
  }
}

/**
 * URL-driven product listing: filters live in the query string so every view is shareable.
 * `fixedBrand` pins the listing to one brand (brand pages) and hides the brand facet.
 */
export function ProductListing({
  basePath,
  fixedBrand,
  title,
  subtitle,
  breadcrumb,
  showSearchBox = true,
}: {
  basePath: string;
  fixedBrand?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  breadcrumb?: ReactNode;
  showSearchBox?: boolean;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const hasViewParam = params.has("view");

  const [search, setSearch] = useState(filters.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [storedView, setStoredView] = useState<"grid" | "list" | null>(null);
  useEffect(() => setSearch(filters.q), [filters.q]);
  useEffect(() => setStoredView(readStoredView()), []);
  const view = hasViewParam ? filters.view : storedView ?? filters.view;

  const update = (patch: FilterPatch) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === "" || v === null || v === false) next.delete(k);
      else next.set(k, v === true ? "1" : String(v));
    });
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: !("view" in patch) });
  };
  const clearAll = () => router.push(basePath);

  const setView = (v: "grid" | "list") => {
    setStoredView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
    update({ view: v });
  };

  const categories = useAsync(() => api.categories(), []);
  const brandParam = fixedBrand ?? filters.brands.join(",");
  const specKey = JSON.stringify(filters.specs);
  const products = useAsync(
    () =>
      marketplaceApi.searchProducts({
        q: filters.q,
        categoryId: filters.categoryId,
        city: filters.city,
        brand: brandParam,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        inStock: filters.inStock,
        minRating: filters.minRating,
        sort: filters.sort,
        page: filters.page,
        pageSize: PAGE_SIZE,
        specs: filters.specs,
      }),
    [filters.q, filters.categoryId, filters.city, brandParam, filters.minPrice, filters.maxPrice, filters.inStock, filters.minRating, filters.sort, filters.page, specKey],
  );

  const facets = products.data?.facets ?? null;
  const categoryList = categories.data ?? [];
  const selectedCategory = categoryList.find((c) => c.id === filters.categoryId);
  const categoryName = selectedCategory ? (lang === "ar" ? selectedCategory.nameAr : selectedCategory.name) : null;
  const heading = title ?? categoryName ?? (filters.q ? `${t("shop.resultsFor")} “${filters.q}”` : t("shop.allProducts"));
  const activeCount = countActiveFilters(filters, !!fixedBrand);
  usePageTitle(typeof heading === "string" ? heading : fixedBrand ?? t("shop.allProducts"));

  const total = products.data?.total ?? 0;
  const list = products.data?.data ?? [];

  const sidebar = (
    <FacetSidebar filters={filters} facets={facets} categories={categoryList} categoriesLoading={categories.loading} hideBrands={!!fixedBrand} onChange={update} onClear={clearAll} />
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-3 text-sm text-slate-500" aria-label={t("common.breadcrumb")}>
        <Link href="/shop" className="hover:text-brand-700">
          {t("nav.shop")}
        </Link>
        {breadcrumb ?? (
          <>
            <span className="mx-2">/</span>
            {selectedCategory ? (
              <>
                <Link href={pathname === basePath ? basePath : "/shop/products"} className="hover:text-brand-700">
                  {t("shop.allProducts")}
                </Link>
                <span className="mx-2">/</span>
                <span className="text-slate-700">{categoryName}</span>
              </>
            ) : (
              <span className="text-slate-700">{t("shop.allProducts")}</span>
            )}
          </>
        )}
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{heading}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {subtitle ?? (products.loading && !products.data ? t("shop.searching") : `${total} ${t("materials.results")}`)}
          </p>
        </div>
        {showSearchBox && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: search.trim() });
            }}
            className="flex w-full gap-2 sm:w-auto"
            role="search"
          >
            <Input name="q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("nav.searchPlaceholder")} className="flex-1 sm:w-80" aria-label={t("nav.searchPlaceholder")} />
            <Button type="submit">{t("hero.search")}</Button>
          </form>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside>
          <div className="mb-3 lg:hidden">
            <Button variant="outline" className="w-full" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="shop-filters">
              {t("materials.filters")}
              {activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
          </div>
          <Card id="shop-filters" className={cn("p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto", !filtersOpen && "hidden lg:block")}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("materials.filters")}</h2>
            {sidebar}
          </Card>
        </aside>

        <section aria-live="polite">
          <ActiveFilterChips filters={filters} facets={facets} categories={categoryList} hideBrands={!!fixedBrand} onChange={update} onClear={clearAll} />

          {facets?.fuzzy && filters.q && (
            <Alert kind="info" className="mb-4">
              {t("shop.noExactMatches")} <strong>“{filters.q}”</strong> {t("shop.showingSimilar")}
            </Alert>
          )}
          {facets?.truncated && <p className="mb-2 text-xs text-slate-400">{t("shop.largeResultSet")}</p>}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-card">
            <span className="text-sm text-slate-600" role="status">
              {products.loading ? t("common.loading") : products.data ? `${total} ${t("materials.results")}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="shop-sort" className="text-sm text-slate-500">
                {t("materials.sort")}
              </label>
              <Select id="shop-sort" name="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })} options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} className="w-44" />
              <div className="ms-1 inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label={t("shop.layout")}>
                <button type="button" onClick={() => setView("grid")} aria-pressed={view === "grid"} aria-label={t("shop.gridView")} className={cn("p-2", view === "grid" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50")}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" />
                  </svg>
                </button>
                <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} aria-label={t("shop.listView")} className={cn("p-2", view === "list" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50")}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                    <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {products.loading && !products.data ? (
            <LoadingBlock className="min-h-[40vh]" />
          ) : products.error ? (
            <Alert onRetry={products.reload}>{products.error}</Alert>
          ) : list.length === 0 ? (
            <Card>
              <EmptyState
                title={t("shop.noProducts")}
                description={filters.q ? `${t("shop.nothingMatches")} “${filters.q}”. ${t("shop.checkSpelling")}` : t("shop.tryDifferent")}
                action={
                  activeCount > 0 ? (
                    <Button variant="outline" onClick={clearAll}>
                      {t("shop.clearFilters")}
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className={cn(products.loading && "opacity-60 transition-opacity")}>
              {view === "list" ? (
                <div className="space-y-3">
                  {list.map((p) => (
                    <ProductCard key={p.id} product={p} layout="list" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {list.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
              {total > (products.data?.pageSize ?? PAGE_SIZE) && (
                <Card className="mt-4">
                  <Pagination page={products.data?.page ?? filters.page} pageSize={products.data?.pageSize ?? PAGE_SIZE} total={total} onChange={(p) => update({ page: p })} />
                </Card>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
