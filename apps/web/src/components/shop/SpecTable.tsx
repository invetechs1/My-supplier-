"use client";

import { useMemo } from "react";
import type { CategoryAttribute } from "@mysupplier/shared";
import { useI18n } from "@/lib/i18n";
import { Card, CardHeader } from "@/components/ui";

function formatValue(v: unknown, type?: CategoryAttribute["type"]): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "BOOLEAN" || typeof v === "boolean") {
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (/^(true|1|yes)$/i.test(String(v))) return "Yes";
    if (/^(false|0|no)$/i.test(String(v))) return "No";
  }
  return String(v);
}

/** Spec table: category attribute definitions first (label + unit), then any remaining free-form specs. */
export function SpecTable({ specs, attributes, title = "Specifications" }: { specs?: Record<string, unknown> | null; attributes?: CategoryAttribute[]; title?: string }) {
  const { lang } = useI18n();
  const rows = useMemo(() => {
    const s = specs ?? {};
    const defs = [...(attributes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const used = new Set<string>();
    const out: { key: string; label: string; value: string; unit?: string | null }[] = [];
    for (const def of defs) {
      const raw = s[def.key];
      if (raw === undefined || raw === null || raw === "") continue;
      used.add(def.key);
      out.push({ key: def.key, label: lang === "ar" ? def.labelAr || def.label : def.label, value: formatValue(raw, def.type), unit: def.unit });
    }
    Object.entries(s).forEach(([key, raw]) => {
      if (used.has(key) || raw === undefined || raw === null || raw === "") return;
      out.push({ key, label: key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()), value: formatValue(raw) });
    });
    return out;
  }, [specs, attributes, lang]);

  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader title={title} />
      <dl className="grid divide-y divide-slate-100 text-sm sm:grid-cols-2 sm:divide-y-0">
        {rows.map((r, i) => (
          <div key={r.key} className={`flex justify-between gap-4 px-5 py-2.5 ${i % 2 === 0 ? "sm:bg-slate-50/60" : ""}`}>
            <dt className="text-slate-500">{r.label}</dt>
            <dd className="text-end font-medium text-slate-900">
              {r.value}
              {r.unit ? <span className="ms-1 text-xs font-normal text-slate-500">{r.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
