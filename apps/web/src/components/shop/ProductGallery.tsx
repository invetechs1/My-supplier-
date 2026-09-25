"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Material } from "@mysupplier/shared";
import { fileUrl } from "@/lib/api/marketplace";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { generatedImageUrl, productImageUrl } from "./ProductCard";

/** Main image + thumbnail strip. Falls back to the generated SKU image when a photo fails to load. */
export function ProductGallery({ material, images, overlay }: { material: Pick<Material, "sku" | "imageUrl" | "name">; images?: string[] | null; overlay?: ReactNode }) {
  const { t } = useI18n();
  const list = useMemo(() => {
    const all = [material.imageUrl, ...(images ?? [])].map((u) => fileUrl(u)).filter((u): u is string => !!u);
    const unique = Array.from(new Set(all));
    return unique.length > 0 ? unique : [productImageUrl(material)];
  }, [material, images]);
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  useEffect(() => setIndex(0), [material.sku]);
  const fallback = generatedImageUrl(material.sku);
  const current = list[Math.min(index, list.length - 1)];
  const src = broken[current] ? fallback : current;

  const step = (dir: 1 | -1) => setIndex((i) => (i + dir + list.length) % list.length);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={material.name} className="h-full w-full object-contain" onError={() => setBroken((b) => ({ ...b, [current]: true }))} />
        {overlay && <div className="absolute start-3 top-3 flex gap-2">{overlay}</div>}
        {list.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label={t("product.prevImage")} className="absolute start-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 rtl:rotate-180" aria-hidden>
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
            <button type="button" onClick={() => step(1)} aria-label={t("product.nextImage")} className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 rtl:rotate-180" aria-hidden>
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="absolute bottom-2 end-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
              {index + 1} / {list.length}
            </span>
          </>
        )}
      </div>
      {list.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t("product.images")}>
          {list.map((u, i) => (
            <li key={u}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${t("product.image")} ${i + 1}`}
                aria-current={i === index}
                className={cn("flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-white p-1 transition", i === index ? "border-brand-600 ring-2 ring-brand-600/20" : "border-slate-200 hover:border-slate-400")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={broken[u] ? fallback : u} alt="" className="h-full w-full object-contain" loading="lazy" onError={() => setBroken((b) => ({ ...b, [u]: true }))} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
