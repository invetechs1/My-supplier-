"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, type Material } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar, timeAgo } from "@/lib/format";
import { Alert, Button, Card, EmptyState, Input, LoadingBlock, Pagination, Select } from "@/components/ui";

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

function MaterialsInner() {
  const { t, lang } = useI18n();
  usePageTitle(t("materials.title"));
  const router = useRouter();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const categoryId = params.get("categoryId") ?? "";
  const city = params.get("city") ?? "";
  const sort = params.get("sort") ?? "updated";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [search, setSearch] = useState(q);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSearch(q), [q]);

  const update = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === "" || v === null) next.delete(k);
      else next.set(k, String(v));
    });
    if (!("page" in patch)) next.delete("page");
    router.push(`/materials?${next.toString()}`);
  };

  const categories = useAsync(() => api.categories(), []);
  const materials = useAsync(() => api.materials({ q, categoryId, city, sort, page, pageSize: 20 }), [q, categoryId, city, sort, page]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));

  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((c) => ({ value: c.id, label: lang === "ar" ? c.nameAr : c.name })),
    [categories.data, lang],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("materials.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {materials.data ? `${materials.data.total} ${t("materials.results")}` : " "}
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
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("hero.searchPlaceholder")} className="flex-1 sm:w-80" />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("materials.filters")}</h2>
            <div className="space-y-4">
              <Select
                label={t("materials.category")}
                name="categoryId"
                value={categoryId}
                onChange={(e) => update({ categoryId: e.target.value })}
                placeholder={t("materials.allCategories")}
                options={categoryOptions}
              />
              <Select
                label={t("materials.city")}
                name="city"
                value={city}
                onChange={(e) => update({ city: e.target.value })}
                placeholder={t("materials.allCities")}
                options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))}
              />
              <Select label={t("materials.sort")} name="sort" value={sort} onChange={(e) => update({ sort: e.target.value })} options={SORTS} />
              {(q || categoryId || city) && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push("/materials")}>
                  Clear filters
                </Button>
              )}
            </div>
          </Card>
          {categories.data && categories.data.length > 0 && (
            <Card className="hidden p-4 lg:block">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">{t("materials.category")}</h2>
              <ul className="space-y-1 text-sm">
                {categories.data.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => update({ categoryId: c.id === categoryId ? "" : c.id })}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start hover:bg-slate-100",
                        c.id === categoryId ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600",
                      )}
                    >
                      <span className="truncate">{lang === "ar" ? c.nameAr : c.name}</span>
                      {typeof c.materialCount === "number" && <span className="text-xs text-slate-400">{c.materialCount}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>

        <section>
          {materials.loading ? (
            <LoadingBlock />
          ) : materials.error ? (
            <Alert onRetry={materials.reload}>{materials.error}</Alert>
          ) : !materials.data || materials.data.data.length === 0 ? (
            <Card>
              <EmptyState title="No materials found" description="Try a different search term or clear the filters." />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {materials.data.data.map((m) => (
                  <MaterialCard key={m.id} material={m} selected={selected.includes(m.id)} onToggle={() => toggle(m.id)} lang={lang} />
                ))}
              </div>
              <Card className="mt-4">
                <Pagination page={materials.data.page} pageSize={materials.data.pageSize} total={materials.data.total} onChange={(p) => update({ page: p })} />
              </Card>
            </>
          )}
        </section>
      </div>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
            <span className="text-sm text-slate-600">
              {selected.length} selected {selected.length >= 4 && <span className="text-xs text-slate-400">(max 4)</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button>
            <Link href={`/compare?ids=${selected.join(",")}${city ? `&city=${encodeURIComponent(city)}` : ""}`} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              {t("materials.compare")} ({selected.length})
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialCard({ material: m, selected, onToggle, lang }: { material: Material; selected: boolean; onToggle: () => void; lang: "en" | "ar" }) {
  return (
    <Card className={cn("flex flex-col p-4 transition hover:shadow-card-hover", selected && "ring-2 ring-brand-600")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/materials/${m.id}`} className="block truncate text-base font-semibold text-slate-900 hover:text-brand-700">
            {lang === "ar" ? m.nameAr || m.name : m.name}
          </Link>
          <p className="truncate text-sm text-slate-500">{lang === "ar" ? m.name : m.nameAr}</p>
          <p className="mt-1 text-xs text-slate-400">
            {m.sku} · per {m.unit}
            {m.brand ? ` · ${m.brand}` : ""}
            {m.category ? ` · ${m.category.name}` : ""}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
          Compare
        </label>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Min</p>
          <p className="text-sm font-semibold tabular-nums text-emerald-700">{formatSar(m.minPrice, lang)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Avg</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900">{formatSar(m.avgPrice, lang)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Max</p>
          <p className="text-sm font-semibold tabular-nums text-slate-700">{formatSar(m.maxPrice, lang)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{m.supplierCount ?? 0} supplier{(m.supplierCount ?? 0) === 1 ? "" : "s"}</span>
        <span>Updated {timeAgo(m.lastUpdated)}</span>
      </div>
    </Card>
  );
}

export default function MaterialsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <MaterialsInner />
    </Suspense>
  );
}
