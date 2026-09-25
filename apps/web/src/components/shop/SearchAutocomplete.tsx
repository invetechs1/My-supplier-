"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ShopSuggestions } from "@mysupplier/shared";
import { marketplaceApi, type ShopProduct } from "@/lib/api/marketplace";
import { useDebounce } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatSar } from "@/lib/format";
import { Spinner } from "@/components/ui";
import { generatedImageUrl } from "./ProductCard";

type Row =
  | { kind: "product"; id: string; href: string; label: string; sub: string; image: string; product: ShopSuggestions["products"][number] }
  | { kind: "category"; id: string; href: string; label: string; icon?: string | null }
  | { kind: "brand"; id: string; href: string; label: string }
  | { kind: "query"; id: string; href: string; label: string };

const EMPTY: ShopSuggestions = { products: [], categories: [], brands: [] };

/**
 * Header search box with an autocomplete dropdown backed by GET /shop/suggest.
 * Arrow keys move through rows, Enter opens the highlighted row (or searches the typed text), Escape closes.
 */
export function SearchAutocomplete({ className, autoFocus, searchPath = "/shop" }: { className?: string; autoFocus?: boolean; searchPath?: string }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ShopSuggestions>(EMPTY);
  const [prices, setPrices] = useState<Record<string, ShopProduct>>({});
  const debounced = useDebounce(q.trim(), 250);
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch suggestions (abort stale requests).
  useEffect(() => {
    if (debounced.length < 2) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    marketplaceApi
      .suggest(debounced, ctrl.signal)
      .then((res) => {
        setData(res);
        setActive(-1);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [debounced]);

  // Best-effort prices for the suggested products (one search call, non-blocking).
  useEffect(() => {
    if (debounced.length < 2 || data.products.length === 0) return;
    let cancelled = false;
    marketplaceApi
      .searchProducts({ q: debounced, pageSize: 8 })
      .then((res) => {
        if (cancelled) return;
        setPrices((prev) => {
          const next = { ...prev };
          res.data.forEach((p) => (next[p.id] = p));
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [debounced, data.products]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim();
    if (!term) return [];
    const out: Row[] = [];
    data.products.forEach((p) =>
      out.push({
        kind: "product",
        id: `p-${p.id}`,
        href: `/shop/products/${p.id}`,
        label: lang === "ar" ? p.nameAr || p.name : p.name,
        sub: p.categoryName,
        image: p.imageUrl || generatedImageUrl(p.sku),
        product: p,
      }),
    );
    data.categories.forEach((c) => out.push({ kind: "category", id: `c-${c.id}`, href: `${searchPath}?categoryId=${encodeURIComponent(c.id)}`, label: lang === "ar" ? c.nameAr : c.name, icon: c.icon }));
    data.brands.forEach((b) => out.push({ kind: "brand", id: `b-${b}`, href: `/brands/${encodeURIComponent(b)}`, label: b }));
    out.push({ kind: "query", id: "query", href: `${searchPath}?q=${encodeURIComponent(term)}`, label: term });
    return out;
  }, [data, q, lang, searchPath]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setActive(-1);
      router.push(href);
    },
    [router],
  );

  const submit = () => {
    const term = q.trim();
    if (active >= 0 && rows[active]) go(rows[active].href);
    else go(term ? `${searchPath}?q=${encodeURIComponent(term)}` : searchPath);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) setOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i <= 0 ? rows.length - 1 : i - 1) : -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const showPanel = open && q.trim().length >= 2;
  const groups: { title: string; rows: Row[] }[] = [
    { title: "Products", rows: rows.filter((r) => r.kind === "product") },
    { title: "Categories", rows: rows.filter((r) => r.kind === "category") },
    { title: "Brands", rows: rows.filter((r) => r.kind === "brand") },
  ].filter((g) => g.rows.length > 0);
  const queryRow = rows.find((r) => r.kind === "query");
  const indexOf = (row: Row) => rows.indexOf(row);

  return (
    <form
      ref={rootRef}
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden>
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t("nav.searchPlaceholder")}
        aria-label={t("nav.searchPlaceholder")}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && rows[active] ? `${listId}-${rows[active].id}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 ps-9 pe-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
      {loading && <Spinner size="sm" className="absolute end-2.5 top-1/2 -translate-y-1/2" />}

      {showPanel && (
        <div id={listId} role="listbox" aria-label="Search suggestions" className="absolute inset-x-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white py-2 shadow-lg sm:min-w-[380px]">
          {rows.length <= 1 && !loading && <p className="px-4 py-2 text-sm text-slate-500">No suggestions — press Enter to search.</p>}
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</p>
              <ul>
                {g.rows.map((row) => {
                  const idx = indexOf(row);
                  const isActive = idx === active;
                  const priced = row.kind === "product" ? prices[row.product.id] : undefined;
                  const best = priced?.bestOffer;
                  return (
                    <li key={row.id} id={`${listId}-${row.id}`} role="option" aria-selected={isActive}>
                      <Link
                        href={row.href}
                        onMouseEnter={() => setActive(idx)}
                        onClick={(e) => {
                          e.preventDefault();
                          go(row.href);
                        }}
                        className={cn("flex items-center gap-3 px-4 py-2 text-sm", isActive ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-50")}
                      >
                        {row.kind === "product" ? (
                          <>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-50">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={row.image} alt="" className="h-full w-full object-contain" loading="lazy" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{row.label}</span>
                              <span className="block truncate text-xs text-slate-500">{row.sub}</span>
                            </span>
                            {best && <span className="shrink-0 text-xs font-semibold tabular-nums text-brand-700">{formatSar((best as { effectivePrice?: number }).effectivePrice ?? best.price, lang)}</span>}
                          </>
                        ) : row.kind === "category" ? (
                          <>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-base text-brand-700">{row.icon ?? "▦"}</span>
                            <span className="truncate">{row.label}</span>
                          </>
                        ) : (
                          <>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">{row.label.slice(0, 1).toUpperCase()}</span>
                            <span className="truncate">{row.label}</span>
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {queryRow && (
            <div className="mt-1 border-t border-slate-100 pt-1">
              <button
                type="button"
                id={`${listId}-${queryRow.id}`}
                role="option"
                aria-selected={indexOf(queryRow) === active}
                onMouseEnter={() => setActive(indexOf(queryRow))}
                onClick={() => go(queryRow.href)}
                className={cn("flex w-full items-center gap-2 px-4 py-2 text-start text-sm font-medium", indexOf(queryRow) === active ? "bg-brand-50 text-brand-800" : "text-brand-700 hover:bg-slate-50")}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
                Search all products for “{queryRow.label}”
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
