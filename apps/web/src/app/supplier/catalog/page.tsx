"use client";
import React from "react";

import { useMemo, useState } from "react";
import { SAUDI_CITIES, UNITS, type SupplierCatalogItem } from "@mysupplier/shared";
import { api, errorMessage, importErrorText, type CatalogImportResult } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, CardHeader, FlashMessage, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";

const CSV_HEADER = ["sku", "name", "nameAr", "categorySlug", "unit", "brand", "price", "city", "stock", "minQty", "leadTimeDays"] as const;
type CsvColumn = (typeof CSV_HEADER)[number];

interface ParsedCsv {
  rows: SupplierCatalogItem[];
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string, defaultCity: string): ParsedCsv {
  const rows: SupplierCatalogItem[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows, errors };

  let columns: CsvColumn[] = [...CSV_HEADER];
  let start = 0;
  const first = splitCsvLine(lines[0]).map((c) => c.replace(/^﻿/, ""));
  if (first.some((c) => (CSV_HEADER as readonly string[]).includes(c)) && first.includes("name")) {
    columns = first.map((c) => (CSV_HEADER as readonly string[]).includes(c) ? (c as CsvColumn) : ("" as CsvColumn));
    start = 1;
  }

  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (col: CsvColumn) => {
      const idx = columns.indexOf(col);
      return idx >= 0 ? cells[idx] ?? "" : "";
    };
    const name = get("name");
    const categorySlug = get("categorySlug");
    const unit = get("unit");
    const price = Number(get("price"));
    const city = get("city") || defaultCity;
    if (!name || !categorySlug || !unit || !Number.isFinite(price) || price <= 0) {
      errors.push(`Line ${i + 1}: needs name, categorySlug, unit and a positive price.`);
      continue;
    }
    const num = (v: string) => (v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
    rows.push({
      sku: get("sku") || undefined,
      name,
      nameAr: get("nameAr") || undefined,
      categorySlug,
      unit,
      brand: get("brand") || undefined,
      price,
      city,
      stock: num(get("stock")),
      minQty: num(get("minQty")),
      leadTimeDays: num(get("leadTimeDays")),
    });
  }
  return { rows, errors };
}

function ImportResultView({ result }: { result: CatalogImportResult }) {
  const errs = result.errors ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-2xl font-semibold tabular-nums text-emerald-700">{result.created ?? 0}</p>
          <p className="text-xs text-emerald-800">products created</p>
        </div>
        <div className="rounded-xl bg-sky-50 p-3">
          <p className="text-2xl font-semibold tabular-nums text-sky-700">{result.updated ?? 0}</p>
          <p className="text-xs text-sky-800">products updated</p>
        </div>
        <div className="rounded-xl bg-brand-50 p-3">
          <p className="text-2xl font-semibold tabular-nums text-brand-700">{result.listings ?? 0}</p>
          <p className="text-xs text-brand-800">offers upserted</p>
        </div>
      </div>
      {errs.length > 0 && (
        <Alert kind="warning">
          <p className="font-semibold">{errs.length} row{errs.length === 1 ? "" : "s"} rejected</p>
          <ul className="mt-1 list-disc ps-4">
            {errs.slice(0, 10).map((e, i) => (
              <li key={i}>{importErrorText(e)}</li>
            ))}
            {errs.length > 10 && <li>…and {errs.length - 10} more</li>}
          </ul>
        </Alert>
      )}
    </div>
  );
}

interface ProductForm {
  name: string;
  nameAr: string;
  categorySlug: string;
  unit: string;
  brand: string;
  description: string;
  imageUrl: string;
  price: string;
  city: string;
  stock: string;
  minQty: string;
  leadTimeDays: string;
  sku: string;
}

const emptyForm = (city: string): ProductForm => ({
  name: "",
  nameAr: "",
  categorySlug: "",
  unit: "ton",
  brand: "",
  description: "",
  imageUrl: "",
  price: "",
  city,
  stock: "",
  minQty: "1",
  leadTimeDays: "3",
  sku: "",
});

export default function SupplierCatalogPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const defaultCity = user?.company?.city ?? "Riyadh";
  const categories = useAsync(() => api.categories(), []);
  const [flash, setFlash] = useFlash(6000);

  const [form, setForm] = useState<ProductForm>(emptyForm(defaultCity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formResult, setFormResult] = useState<CatalogImportResult | null>(null);

  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<CatalogImportResult | null>(null);

  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((c) => ({ value: c.slug, label: `${lang === "ar" ? c.nameAr : c.name} (${c.slug})` })),
    [categories.data, lang],
  );
  const set = (patch: Partial<ProductForm>) => setForm((f) => ({ ...f, ...patch }));

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Product name is required.";
    if (!form.categorySlug) next.categorySlug = "Choose a category.";
    if (!form.unit) next.unit = "Choose a unit.";
    const price = Number(form.price);
    if (!form.price || !Number.isFinite(price) || price <= 0) next.price = "Enter a valid price.";
    if (!form.city) next.city = "Choose a city.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const item: SupplierCatalogItem = {
      sku: form.sku.trim() || undefined,
      name: form.name.trim(),
      nameAr: form.nameAr.trim() || undefined,
      categorySlug: form.categorySlug,
      unit: form.unit,
      brand: form.brand.trim() || undefined,
      description: form.description.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      price,
      city: form.city,
      stock: num(form.stock),
      minQty: num(form.minQty),
      leadTimeDays: num(form.leadTimeDays),
    };
    setSaving(true);
    try {
      const res = await api.supplierCatalogImport([item]);
      setFormResult(res);
      if ((res.errors ?? []).length === 0) {
        setFlash({ kind: "success", message: `"${item.name}" is now listed in the shop.` });
        setForm(emptyForm(defaultCity));
      } else {
        setFlash({ kind: "error", message: "The product was not accepted. See details below." });
      }
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const submitCsv = async () => {
    const p = parsed ?? parseCsv(csv, defaultCity);
    setParsed(p);
    if (p.rows.length === 0) {
      setFlash({ kind: "error", message: "No valid rows to import." });
      return;
    }
    setCsvBusy(true);
    try {
      const res = await api.supplierCatalogImport(p.rows);
      setCsvResult(res);
      setFlash({ kind: "success", message: `Import finished: ${res.created ?? 0} created, ${res.updated ?? 0} updated, ${res.listings ?? 0} offers.` });
      if ((res.errors ?? []).length === 0) {
        setCsv("");
        setParsed(null);
      }
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("sup.catalog")}
        subtitle="List your products with live price and stock. They appear instantly in the shop, where buyers can add them to their cart."
        action={<LinkButton href="/supplier/prices" variant="outline">Manage price list</LinkButton>}
      />
      <FlashMessage flash={flash} className="mb-4" />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Add a product" subtitle="Creates the product if the SKU or name is new and publishes your offer." />
          <CardBody>
            <form onSubmit={submitForm} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Product name" name="name" value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} placeholder="Portland cement OPC 50kg" required />
                <Input label="Arabic name" name="nameAr" value={form.nameAr} onChange={(e) => set({ nameAr: e.target.value })} placeholder="إسمنت بورتلاندي 50 كجم" dir="rtl" />
                <Select
                  label="Category"
                  name="categorySlug"
                  value={form.categorySlug}
                  onChange={(e) => set({ categorySlug: e.target.value })}
                  placeholder={categories.loading ? "Loading…" : "Select category"}
                  options={categoryOptions}
                  error={errors.categorySlug ?? (categories.error ? `Categories unavailable: ${categories.error}` : null)}
                  required
                />
                <Select label="Unit" name="unit" value={form.unit} onChange={(e) => set({ unit: e.target.value })} options={UNITS.map((u) => ({ value: u, label: u }))} error={errors.unit} required />
                <Input label="Brand" name="brand" value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="e.g. Yamama, SABIC" />
                <Input label="SKU (optional)" name="sku" value={form.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="Leave blank to auto-generate" dir="ltr" />
                <Textarea label="Description" name="description" value={form.description} onChange={(e) => set({ description: e.target.value })} className="sm:col-span-2" rows={3} />
                <Input label="Image URL" name="imageUrl" type="url" value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://…" className="sm:col-span-2" dir="ltr" hint="Optional. A product image is generated when left empty." />
              </div>
              <h3 className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900">Your offer</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label={`Price (SAR / ${form.unit})`} name="price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} error={errors.price} required dir="ltr" />
                <Select label="City" name="city" value={form.city} onChange={(e) => set({ city: e.target.value })} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.city} required />
                <Input label="Stock" name="stock" type="number" min={0} value={form.stock} onChange={(e) => set({ stock: e.target.value })} placeholder="Blank = on request" dir="ltr" />
                <Input label="Minimum quantity" name="minQty" type="number" min={1} value={form.minQty} onChange={(e) => set({ minQty: e.target.value })} dir="ltr" />
                <Input label="Lead time (days)" name="leadTimeDays" type="number" min={0} value={form.leadTimeDays} onChange={(e) => set({ leadTimeDays: e.target.value })} dir="ltr" />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={saving} variant="accent">
                  Publish product
                </Button>
              </div>
            </form>
            {formResult && (
              <div className="mt-4">
                <ImportResultView result={formResult} />
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Bulk upload (CSV)" subtitle="One product per line. Header row is recognised; columns may be in any order when a header is present." />
          <CardBody className="space-y-3">
            <Textarea
              name="csv"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setParsed(null);
                setCsvResult(null);
              }}
              rows={12}
              className="font-mono text-xs"
              placeholder={`${CSV_HEADER.join(",")}\nCEM-OPC-50,Portland cement OPC 50kg,إسمنت بورتلاندي,cement,bag,Yamama,18.5,Riyadh,5000,50,2\n,Rebar 16mm B500B,حديد تسليح 16 مم,steel,ton,Hadeed,2650,Jeddah,,5,7`}
              hint={`Required: name, categorySlug, unit, price. City defaults to ${defaultCity}.`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setParsed(parseCsv(csv, defaultCity))} disabled={!csv.trim()}>
                Validate
              </Button>
              <Button onClick={submitCsv} loading={csvBusy} disabled={!csv.trim()}>
                Import{parsed ? ` ${parsed.rows.length} rows` : ""}
              </Button>
              {parsed && (
                <span className="text-sm text-slate-600">
                  {parsed.rows.length} valid · {parsed.errors.length} invalid
                </span>
              )}
            </div>
            {parsed && parsed.errors.length > 0 && (
              <Alert kind="warning">
                <ul className="list-disc ps-4">
                  {parsed.errors.slice(0, 8).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more</li>}
                </ul>
              </Alert>
            )}
            {parsed && parsed.rows.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-start">Name</th>
                      <th className="px-3 py-2 text-start">Category</th>
                      <th className="px-3 py-2 text-start">Unit</th>
                      <th className="px-3 py-2 text-end">Price</th>
                      <th className="px-3 py-2 text-start">City</th>
                      <th className="px-3 py-2 text-end">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.rows.slice(0, 100).map((r, i) => (
                      <tr key={`${r.sku ?? r.name}-${i}`}>
                        <td className="px-3 py-1.5 font-medium text-slate-900">{r.name}</td>
                        <td className="px-3 py-1.5 font-mono">{r.categorySlug}</td>
                        <td className="px-3 py-1.5">{r.unit}</td>
                        <td className="px-3 py-1.5 text-end tabular-nums">{r.price}</td>
                        <td className="px-3 py-1.5">{r.city}</td>
                        <td className="px-3 py-1.5 text-end tabular-nums">{r.stock ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {csvResult && <ImportResultView result={csvResult} />}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Category slugs" subtitle="Use these in the categorySlug column." />
        <CardBody>
          {categories.loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : categories.error ? (
            <Alert onRetry={categories.reload}>{categories.error}</Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(categories.data ?? []).map((c) => (
                <button key={c.id} type="button" onClick={() => set({ categorySlug: c.slug })} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-brand-300 hover:bg-brand-50" title="Use in the form">
                  <span className="font-mono text-brand-700">{c.slug}</span> · {lang === "ar" ? c.nameAr : c.name}
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
