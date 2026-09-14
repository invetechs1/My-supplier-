"use client";

import React from "react";
import Link from "next/link";
import type { BoqSupplierBreakdown } from "@mysupplier/shared";
import { cn, formatSar } from "@/lib/format";
import { Badge, VerifiedBadge } from "@/components/ui";
import { isMarketSupplier } from "./BoqSummary";

export function BoqSuppliers({ suppliers, bestId, lineCount, lang }: { suppliers: BoqSupplierBreakdown[]; bestId: string | null; lineCount: number; lang: "en" | "ar" }) {
  if (suppliers.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">No suppliers have prices for these lines yet.</p>;
  }
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
      {suppliers.map((s) => {
        const best = s.supplierId === bestId;
        const market = isMarketSupplier(s.supplierId);
        return (
          <div key={s.supplierId} className={cn("relative rounded-xl border p-4", best ? "border-amber-400 bg-amber-50/60 ring-1 ring-amber-400" : "border-slate-200 bg-white")}>
            {best && <Badge tone="amber" className="absolute -top-2.5 end-3">Best single supplier</Badge>}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                  {market ? s.supplierName : <Link href={`/suppliers/${s.supplierId}`} className="hover:text-brand-700">{s.supplierName}</Link>}
                  <VerifiedBadge verified={s.verified} />
                </p>
                <p className="text-xs text-slate-500">{s.city}{market && " · market reference"}</p>
              </div>
              <p className="shrink-0 text-end">
                <span className="block text-lg font-semibold tabular-nums text-slate-900">{formatSar(s.total, lang)}</span>
                <span className="text-[11px] text-slate-500">for covered lines</span>
              </p>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>Coverage</span>
                <span className="tabular-nums">{s.linesCovered}/{lineCount} lines · {Math.round(s.coveragePct)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={cn("h-full rounded-full", s.coveragePct >= 100 ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${Math.min(100, Math.max(2, s.coveragePct))}%` }} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <span>Avg lead time {s.avgLeadTimeDays.toFixed(0)} d</span>
              {!market && <Link href={`/suppliers/${s.supplierId}`} className="font-semibold text-brand-700 hover:underline">View profile →</Link>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
