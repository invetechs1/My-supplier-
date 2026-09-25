"use client";

import Link from "next/link";
import { useState } from "react";
import type { BrandSummary } from "@mysupplier/shared";
import { fileUrl } from "@/lib/api/marketplace";
import { cn } from "@/lib/format";

export function BrandTile({ brand, compact }: { brand: BrandSummary; compact?: boolean }) {
  const [broken, setBroken] = useState(false);
  const img = !broken ? fileUrl(brand.imageUrl) : null;
  return (
    <Link
      href={`/brands/${encodeURIComponent(brand.brand)}`}
      className={cn("group flex flex-col items-center rounded-xl border border-slate-200 bg-white text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover", compact ? "w-[140px] shrink-0 px-3 py-4" : "p-5")}
    >
      <span className={cn("flex items-center justify-center overflow-hidden rounded-full bg-slate-50 ring-1 ring-slate-100", compact ? "h-14 w-14" : "h-20 w-20")}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-contain p-1" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span className={cn("font-bold text-brand-700", compact ? "text-xl" : "text-2xl")} aria-hidden>
            {brand.brand.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className={cn("mt-3 line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-700", compact ? "text-xs" : "text-sm")}>{brand.brand}</span>
      <span className="mt-0.5 text-[11px] text-slate-400">
        {brand.productCount} {brand.productCount === 1 ? "product" : "products"}
      </span>
    </Link>
  );
}

