"use client";
import React from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { SAUDI_CITIES, type Material } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar, timeAgo } from "@/lib/format";
import { Alert, Button, Card, EmptyState, LinkButton, LoadingBlock, PageHeader, Select, VerifiedBadge } from "@/components/ui";
import { MaterialAutocomplete } from "@/components/MaterialAutocomplete";

function CompareInner() {
  const { t, lang } = useI18n();
  usePageTitle(t("materials.compare"));
  const router = useRouter();
  const params = useSearchParams();
  const ids = useMemo(() => (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [params]);
  const city = params.get("city") ?? "";
  const [picked, setPicked] = useState<Material | null>(null);

  const state = useAsync(() => api.compare(ids, city || undefined), [ids.join(","), city], ids.length > 0);

  const setIds = (next: string[]) => {
    const sp = new URLSearchParams();
    if (next.length) sp.set("ids", next.join(","));
    if (city) sp.set("city", city);
    router.push(`/compare?${sp.toString()}`);
  };

  const rows: Array<{ label: string; render: (e: NonNullable<typeof state.data>[number]) => React.ReactNode; highlight?: "min" | "max" }> = [
    { label: "Unit", render: (e) => e.material.unit },
    { label: "Brand", render: (e) => e.material.brand ?? "—" },
    { label: "Category", render: (e) => e.material.category?.name ?? "—" },
    { label: t("price.lowest"), render: (e) => <span className="font-semibold text-emerald-700">{formatSar(e.summary.min, lang)}</span> },
    { label: t("price.average"), render: (e) => formatSar(e.summary.avg, lang) },
    { label: t("price.median"), render: (e) => formatSar(e.summary.median, lang) },
    { label: t("price.highest"), render: (e) => formatSar(e.summary.max, lang) },
    { label: t("price.suppliers"), render: (e) => e.summary.count },
    {
      label: "Cheapest supplier",
      render: (e) => {
        const cheapest = [...e.listings].sort((a, b) => a.price - b.price)[0];
        if (!cheapest) return "—";
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {cheapest.company ? <Link href={`/suppliers/${cheapest.company.id}`} className="hover:text-brand-700">{cheapest.company.name}</Link> : cheapest.sourceName ?? "Market"}
            {cheapest.company && <VerifiedBadge verified={cheapest.company.verified} />}
            <span className="text-xs text-slate-500">({cheapest.city})</span>
          </div>
        );
      },
    },
    { label: "Last updated", render: (e) => timeAgo(e.summary.lastUpdated) },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title={t("nav.compare")} subtitle="Compare up to 4 materials side by side." />

      <Card className="mb-6 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <MaterialAutocomplete value={picked} onChange={setPicked} placeholder="Add a material to compare…" />
          <Select
            name="city"
            value={city}
            onChange={(e) => {
              const sp = new URLSearchParams(params.toString());
              if (e.target.value) sp.set("city", e.target.value);
              else sp.delete("city");
              router.push(`/compare?${sp.toString()}`);
            }}
            placeholder={t("materials.allCities")}
            options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))}
          />
          <Button
            disabled={!picked || ids.length >= 4 || (picked ? ids.includes(picked.id) : false)}
            onClick={() => {
              if (!picked) return;
              setIds([...ids, picked.id]);
              setPicked(null);
            }}
          >
            Add
          </Button>
        </div>
      </Card>

      {ids.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to compare yet"
            description="Select materials from the catalogue with the Compare checkbox, or add them above."
            action={<LinkButton href="/materials">Browse materials</LinkButton>}
          />
        </Card>
      ) : state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="w-44 px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">Material</th>
                {(state.data ?? []).map((e) => (
                  <th key={e.material.id} className="min-w-[200px] px-4 py-3 text-start align-top">
                    <Link href={`/materials/${e.material.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                      {lang === "ar" ? e.material.nameAr || e.material.name : e.material.name}
                    </Link>
                    <p className="text-xs font-normal text-slate-500">{e.material.sku}</p>
                    <button type="button" onClick={() => setIds(ids.filter((x) => x !== e.material.id))} className="mt-1 text-xs font-medium text-red-600 hover:underline">
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">{r.label}</th>
                  {(state.data ?? []).map((e) => (
                    <td key={e.material.id} className={cn("px-4 py-3 tabular-nums text-slate-700")}>{r.render(e)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CompareInner />
    </Suspense>
  );
}
