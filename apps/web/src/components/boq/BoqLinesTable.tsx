"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { BoqLineResult } from "@mysupplier/shared";
import { cn, formatSar } from "@/lib/format";
import { Badge, SourceBadge, VerifiedBadge } from "@/components/ui";
import { isMarketSupplier } from "./BoqSummary";

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.8 ? "green" : value >= 0.5 ? "amber" : "red";
  return <Badge tone={tone}>{pct}% match</Badge>;
}

interface Props {
  lines: BoqLineResult[];
  lang: "en" | "ar";
  onRepin: (index: number, materialId: string) => void;
  repinning: boolean;
}

export function BoqLinesTable({ lines, lang, onRepin, repinning }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-start">#</th>
            <th className="px-4 py-3 text-start">Your description</th>
            <th className="px-4 py-3 text-end">Qty</th>
            <th className="min-w-[260px] px-4 py-3 text-start">Matched material</th>
            <th className="px-4 py-3 text-start">Best supplier</th>
            <th className="px-4 py-3 text-end">Best unit price</th>
            <th className="px-4 py-3 text-end">Line total</th>
            <th className="px-4 py-3 text-end"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line) => {
            const open = expanded === line.index;
            const match = line.match;
            const offer = line.bestOffer;
            const options = [
              ...(match ? [{ material: match.material, confidence: match.confidence }] : []),
              ...line.alternatives.filter((a) => a.material.id !== match?.material.id),
            ];
            return (
              <React.Fragment key={line.index}>
                <tr className={cn("align-top", !match && "bg-red-50/40")}>
                  <td className="px-4 py-3 text-slate-400">{line.index + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{line.description}</p>
                    {line.unitMismatch && <Badge tone="amber" className="mt-1">Unit mismatch</Badge>}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {line.quantity} <span className="text-slate-500">{line.unit}</span>
                  </td>
                  <td className="px-4 py-3">
                    {match ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/materials/${match.material.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                            {match.material.name}
                          </Link>
                          <ConfidenceBadge value={match.confidence} />
                        </div>
                        <p className="text-xs text-slate-500" dir="rtl">{match.material.nameAr}</p>
                        <p className="text-xs text-slate-400">
                          {match.material.sku} · per {match.material.unit}
                          {line.unitMismatch && <span className="text-amber-700"> (you wrote {line.unit})</span>}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-red-700">No match found</p>
                    )}
                    {options.length > 1 || (!match && line.alternatives.length > 0) ? (
                      <select
                        value={match?.material.id ?? ""}
                        disabled={repinning}
                        onChange={(e) => e.target.value && onRepin(line.index, e.target.value)}
                        className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-600 focus:outline-none disabled:opacity-60"
                        aria-label={`Change match for line ${line.index + 1}`}
                      >
                        {!match && <option value="">Pick a material…</option>}
                        {options.map((o) => (
                          <option key={o.material.id} value={o.material.id}>
                            {o.material.name} ({Math.round(o.confidence * 100)}%)
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {offer ? (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isMarketSupplier(offer.supplierId) ? (
                            <span className="font-medium text-slate-800">{offer.supplierName}</span>
                          ) : (
                            <Link href={`/suppliers/${offer.supplierId}`} className="font-medium text-slate-900 hover:text-brand-700">{offer.supplierName}</Link>
                          )}
                          <VerifiedBadge verified={offer.verified} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {offer.city} · {offer.leadTimeDays} d lead
                          {offer.minQty > line.quantity && <span className="text-amber-700"> · min {offer.minQty}</span>}
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {offer ? (
                      <>
                        <p className="font-semibold text-slate-900">{formatSar(offer.price, lang)}</p>
                        {line.avgUnitPrice !== null && <p className="text-xs text-slate-400">avg {formatSar(line.avgUnitPrice, lang)}</p>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold tabular-nums text-brand-700">{offer ? formatSar(offer.lineTotal, lang) : "—"}</td>
                  <td className="px-4 py-3 text-end">
                    {line.offers.length > 0 && (
                      <button type="button" onClick={() => setExpanded(open ? null : line.index)} className="whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline">
                        {open ? "Hide" : `${line.offers.length} offer${line.offers.length === 1 ? "" : "s"}`}
                      </button>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="bg-slate-50">
                    <td colSpan={8} className="px-6 py-3">
                      <table className="w-full text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="py-1 text-start font-medium">Supplier</th>
                            <th className="py-1 text-start font-medium">Source</th>
                            <th className="py-1 text-start font-medium">City</th>
                            <th className="py-1 text-end font-medium">Unit price</th>
                            <th className="py-1 text-end font-medium">Min qty</th>
                            <th className="py-1 text-end font-medium">Lead time</th>
                            <th className="py-1 text-end font-medium">Line total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {line.offers.map((o) => (
                            <tr key={o.listingId} className={cn("border-t border-slate-200", o.listingId === offer?.listingId && "font-semibold text-brand-800")}>
                              <td className="py-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  {isMarketSupplier(o.supplierId) ? o.supplierName : <Link href={`/suppliers/${o.supplierId}`} className="hover:text-brand-700">{o.supplierName}</Link>}
                                  <VerifiedBadge verified={o.verified} />
                                </span>
                              </td>
                              <td className="py-1.5"><SourceBadge source={o.source} /></td>
                              <td className="py-1.5">{o.city}</td>
                              <td className="py-1.5 text-end tabular-nums">{formatSar(o.price, lang)}</td>
                              <td className="py-1.5 text-end tabular-nums">{o.minQty}</td>
                              <td className="py-1.5 text-end tabular-nums">{o.leadTimeDays} d</td>
                              <td className="py-1.5 text-end tabular-nums">{formatSar(o.lineTotal, lang)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
