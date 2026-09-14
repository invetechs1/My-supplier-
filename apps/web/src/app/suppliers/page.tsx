"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SAUDI_CITIES } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, Badge, Button, Card, EmptyState, Input, LoadingBlock, PageHeader, Select, VerifiedBadge } from "@/components/ui";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" fill="currentColor" className={i <= Math.round(rating) ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-slate-200"} aria-hidden>
          <path d="M10 15.27L16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
        </svg>
      ))}
    </span>
  );
}

function SuppliersInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const city = params.get("city") ?? "";
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const update = (patch: { q?: string; city?: string }) => {
    const sp = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? sp.set(k, v) : sp.delete(k)));
    router.push(`/suppliers?${sp.toString()}`);
  };

  const state = useAsync(() => api.suppliers({ q, city }), [q, city]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title={t("suppliers.title")} subtitle="Verified building-material suppliers across the Kingdom." />
      <Card className="mb-6 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() });
          }}
          className="grid gap-3 sm:grid-cols-[1fr_200px_auto]"
        >
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers by name…" />
          <Select name="city" value={city} onChange={(e) => update({ city: e.target.value })} placeholder={t("materials.allCities")} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>

      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (state.data ?? []).length === 0 ? (
        <Card><EmptyState title="No suppliers found" description="Try another city or search term." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(state.data ?? []).map((c) => (
            <Link key={c.id} href={`/suppliers/${c.id}`} className="block">
              <Card className="h-full p-5 transition hover:shadow-card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-base font-semibold text-brand-700">{c.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      {c.nameAr && <p className="text-xs text-slate-500">{c.nameAr}</p>}
                    </div>
                  </div>
                  <VerifiedBadge verified={c.verified} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <Badge tone="slate">{c.city}</Badge>
                  {c.region && <span className="text-xs text-slate-400">{c.region}</span>}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <Stars rating={c.rating} />
                  <span>{c.rating.toFixed(1)} ({c.ratingCount})</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SuppliersInner />
    </Suspense>
  );
}
