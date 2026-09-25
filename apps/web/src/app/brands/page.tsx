"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BrandSummary } from "@mysupplier/shared";
import { marketplaceApi } from "@/lib/api/marketplace";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, Card, EmptyState, Input, LoadingBlock, PageHeader } from "@/components/ui";
import { BrandTile } from "@/components/shop/BrandTile";

export default function BrandsPage() {
  const { t } = useI18n();
  usePageTitle(t("nav.brands"));
  const brands = useAsync(() => marketplaceApi.brands(), []);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const list = (brands.data ?? []).filter((b) => b.brand.toLowerCase().includes(q.trim().toLowerCase()));
    const map = new Map<string, BrandSummary[]>();
    [...list]
      .sort((a, b) => a.brand.localeCompare(b.brand))
      .forEach((b) => {
        const letter = /^[a-z]/i.test(b.brand) ? b.brand[0].toUpperCase() : "#";
        map.set(letter, [...(map.get(letter) ?? []), b]);
      });
    return { list, letters: [...map.entries()] };
  }, [brands.data, q]);

  const popular = useMemo(() => (brands.data ?? []).slice(0, 12), [brands.data]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-3 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:text-brand-700">
          {t("nav.shop")}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{t("nav.brands")}</span>
      </nav>
      <PageHeader
        title={t("nav.brands")}
        subtitle={brands.data ? `${brands.data.length} brands with live offers` : "Shop by manufacturer"}
        action={<Input name="brand-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a brand…" aria-label="Find a brand" className="w-64" />}
      />

      {brands.loading ? (
        <LoadingBlock className="min-h-[40vh]" />
      ) : brands.error ? (
        <Alert onRetry={brands.reload}>{brands.error}</Alert>
      ) : (brands.data ?? []).length === 0 ? (
        <Card>
          <EmptyState title="No brands yet" description="Brands appear here as soon as suppliers publish branded products." />
        </Card>
      ) : (
        <div className="space-y-10">
          {!q && popular.length > 0 && (
            <section aria-labelledby="brands-popular">
              <h2 id="brands-popular" className="mb-4 text-lg font-semibold text-slate-900">
                Most popular
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {popular.map((b) => (
                  <BrandTile key={b.brand} brand={b} />
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="brands-all">
            <h2 id="brands-all" className="mb-4 text-lg font-semibold text-slate-900">
              {q ? `Matching “${q}”` : "All brands A–Z"}
            </h2>
            {groups.list.length === 0 ? (
              <Card>
                <EmptyState title="No brand matches" description="Try a shorter name." />
              </Card>
            ) : (
              <div className="space-y-6">
                {groups.letters.map(([letter, list]) => (
                  <div key={letter} className="grid gap-3 sm:grid-cols-[48px_1fr]">
                    <div className="text-2xl font-bold text-brand-700">{letter}</div>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {list.map((b) => (
                        <li key={b.brand}>
                          <Link href={`/brands/${encodeURIComponent(b.brand)}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700">
                            <span className="truncate font-medium">{b.brand}</span>
                            <span className="text-xs tabular-nums text-slate-400">{b.productCount}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
