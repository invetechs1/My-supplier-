"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Material } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useDebounce } from "@/lib/hooks";
import { cn } from "@/lib/format";
import { Label, Spinner } from "./ui";

interface Props {
  label?: string;
  value: Material | null;
  onChange: (material: Material | null) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  error?: string | null;
}

export function MaterialAutocomplete({ label, value, onChange, placeholder = "Search materials by name or SKU…", className, required, error }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Material[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const debounced = useDebounce(query, 250);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    if (debounced.trim().length < 1) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .materials({ q: debounced.trim(), pageSize: 8 })
      .then((r) => {
        if (active) setResults(r.data);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debounced, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (m: Material) => {
    onChange(m);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={ref}>
      {label && <Label required={required}>{label}</Label>}
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{value.name}</p>
            <p className="truncate text-xs text-slate-500">
              {value.sku} · {value.unit}
              {value.brand ? ` · ${value.brand}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open || results.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const m = results[highlight];
                if (m) select(m);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            className={cn(
              "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pe-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20",
              error && "border-red-400",
            )}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
          />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400">
            {loading ? (
              <Spinner size="sm" />
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            )}
          </span>
          {open && query.trim().length > 0 && (
            <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {results.length === 0 && !loading && <li className="px-3 py-2 text-sm text-slate-500">No materials found</li>}
              {results.map((m, i) => (
                <li
                  key={m.id}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(m);
                  }}
                  className={cn("cursor-pointer px-3 py-2 text-sm", i === highlight ? "bg-brand-50 text-brand-800" : "text-slate-700")}
                >
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-slate-500">
                    {m.sku} · {m.unit}
                    {m.brand ? ` · ${m.brand}` : ""}
                    {m.category ? ` · ${m.category.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
