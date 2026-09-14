"use client";

import React from "react";
import Link from "next/link";
import type { BoqAnalysis } from "@mysupplier/shared";
import { formatSar } from "@/lib/format";
import { Badge, StatTile, VerifiedBadge } from "@/components/ui";

export function isMarketSupplier(supplierId: string): boolean {
  return supplierId.startsWith("market:");
}

export function BoqSummary({ analysis, lang }: { analysis: BoqAnalysis; lang: "en" | "ar" }) {
  const s = analysis.summary;
  const best = s.bestSingleSupplier;
  const savingsPct = s.averageTotal > 0 ? (s.savingsVsAverage / s.averageTotal) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatTile
        label="Cheapest total"
        value={formatSar(s.cheapestTotal, lang)}
        sub={`mixing ${s.distinctSuppliersInCheapest} supplier${s.distinctSuppliersInCheapest === 1 ? "" : "s"}`}
        tone="brand"
      />
      <StatTile label="Average market total" value={formatSar(s.averageTotal, lang)} sub={`highest ${formatSar(s.highestTotal, lang)}`} />
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-card">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">You save vs average</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{formatSar(Math.max(0, s.savingsVsAverage), lang)}</p>
        <p className="mt-1 text-xs text-emerald-700">{savingsPct > 0 ? `${savingsPct.toFixed(1)}% below average` : "at market average"}</p>
      </div>
      <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-card lg:col-span-1">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Best single supplier</p>
        {best ? (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base font-semibold text-slate-900">
              {isMarketSupplier(best.supplierId) ? best.supplierName : <Link href={`/suppliers/${best.supplierId}`} className="hover:text-brand-700">{best.supplierName}</Link>}
              <VerifiedBadge verified={best.verified} />
            </p>
            <p className="mt-1 text-xs text-slate-600">
              covers {Math.round(best.coveragePct)}% · {formatSar(best.total, lang)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No supplier covers these lines.</p>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lines matched</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          {analysis.matchedLines}
          <span className="text-base font-normal text-slate-400"> / {analysis.lineCount}</span>
        </p>
        <p className="mt-1 text-xs">{analysis.unmatchedLines > 0 ? <Badge tone="red">{analysis.unmatchedLines} unmatched</Badge> : <Badge tone="green">All matched</Badge>}</p>
      </div>
    </div>
  );
}
