"use client";
import React from "react";

import { useState } from "react";
import type { Feed } from "@mysupplier/shared";
import { api, errorMessage, importErrorText, type CatalogImportResult, type FeedRow } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Select, Table, Textarea, type Column } from "@/components/ui";

const SAMPLE_ROWS: FeedRow[] = [
  { sku: "EXT-CEM-001", name: "Portland cement OPC 50kg", nameAr: "إسمنت بورتلاندي 50 كجم", category: "cement", unit: "bag", brand: "Yamama", price: 18.25, city: "Riyadh", stock: 2000 },
  { sku: "EXT-STL-016", name: "Rebar 16mm B500B", nameAr: "حديد تسليح 16 مم", category: "steel", unit: "ton", brand: "Hadeed", price: 2640, city: "Dammam" },
];

function statusTone(status: string | null | undefined): "green" | "red" | "amber" | "slate" {
  if (!status) return "slate";
  const s = status.toLowerCase();
  if (s.includes("ok") || s.includes("success") || s === "done") return "green";
  if (s.includes("fail") || s.includes("error")) return "red";
  if (s.includes("run") || s.includes("pending")) return "amber";
  return "slate";
}

function ResultSummary({ result }: { result: CatalogImportResult }) {
  const errs = result.errors ?? [];
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-emerald-700">{result.created ?? 0}</span> created · <span className="font-semibold text-sky-700">{result.updated ?? 0}</span> updated ·{" "}
        <span className="font-semibold text-brand-700">{result.listings ?? 0}</span> listings · <span className={errs.length ? "font-semibold text-red-700" : "font-semibold text-slate-500"}>{errs.length}</span> errors
      </p>
      {errs.length > 0 && (
        <ul className="list-disc ps-4 text-xs text-red-700">
          {errs.slice(0, 8).map((e, i) => (
            <li key={i}>{importErrorText(e)}</li>
          ))}
          {errs.length > 8 && <li>…and {errs.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}

export default function AdminFeedsPage() {
  const { t, lang } = useI18n();
  const feeds = useAsync(() => api.adminFeeds(), []);
  const [flash, setFlash] = useFlash(6000);

  const [form, setForm] = useState<{ name: string; url: string; format: "json" | "csv"; enabled: boolean }>({ name: "", url: "", format: "json", enabled: true });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const [running, setRunning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, CatalogImportResult | { error: string }>>({});

  const [sourceName, setSourceName] = useState("");
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<CatalogImportResult | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required.";
    try {
      const u = new URL(form.url.trim());
      if (!/^https?:$/.test(u.protocol)) errs.url = "URL must start with http:// or https://";
    } catch {
      errs.url = "Enter a valid URL.";
    }
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setCreating(true);
    try {
      await api.adminCreateFeed({ name: form.name.trim(), url: form.url.trim(), format: form.format, enabled: form.enabled });
      setFlash({ kind: "success", message: `Feed "${form.name.trim()}" created.` });
      setForm({ name: "", url: "", format: "json", enabled: true });
      feeds.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setCreating(false);
    }
  };

  const run = async (f: Feed) => {
    setRunning(f.id);
    try {
      const res = await api.adminRunFeed(f.id);
      setRunResults((r) => ({ ...r, [f.id]: res }));
      setFlash({ kind: "success", message: `"${f.name}" ran: ${res.created ?? 0} created, ${res.updated ?? 0} updated, ${res.listings ?? 0} listings.` });
      feeds.reload();
    } catch (err) {
      const message = errorMessage(err);
      setRunResults((r) => ({ ...r, [f.id]: { error: message } }));
      setFlash({ kind: "error", message });
    } finally {
      setRunning(null);
    }
  };

  const remove = async (f: Feed) => {
    if (!window.confirm(`Delete feed "${f.name}"? Imported materials and prices are kept.`)) return;
    setDeleting(f.id);
    try {
      await api.adminDeleteFeed(f.id);
      setFlash({ kind: "success", message: "Feed deleted." });
      feeds.setData((prev) => (prev ? prev.filter((x) => x.id !== f.id) : prev));
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(null);
    }
  };

  const parseRows = (): FeedRow[] | null => {
    setJsonError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setJsonError("Invalid JSON.");
      return null;
    }
    const arr = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items) ? (parsed as { items: unknown[] }).items : null;
    if (!arr) {
      setJsonError("Expected a JSON array of rows, or an object with an \"items\" array.");
      return null;
    }
    const rows: FeedRow[] = [];
    const problems: string[] = [];
    arr.forEach((raw, i) => {
      const r = raw as Partial<FeedRow>;
      const price = Number(r.price);
      if (!r || typeof r !== "object" || !r.sku || !r.name || !r.category || !r.unit || !r.city || !Number.isFinite(price) || price <= 0) {
        problems.push(`Row ${i + 1}: needs sku, name, category, unit, city and a positive price.`);
        return;
      }
      rows.push({
        sku: String(r.sku),
        name: String(r.name),
        nameAr: r.nameAr ? String(r.nameAr) : undefined,
        category: String(r.category),
        unit: String(r.unit),
        brand: r.brand ? String(r.brand) : undefined,
        price,
        city: String(r.city),
        imageUrl: r.imageUrl ? String(r.imageUrl) : undefined,
        stock: r.stock !== undefined && r.stock !== null && Number.isFinite(Number(r.stock)) ? Number(r.stock) : undefined,
      });
    });
    if (problems.length > 0) {
      setJsonError(`${problems.length} invalid row${problems.length === 1 ? "" : "s"}: ${problems.slice(0, 3).join(" ")}${problems.length > 3 ? " …" : ""}`);
    }
    return rows;
  };

  const importInline = async () => {
    if (!sourceName.trim()) {
      setJsonError("Enter a source name.");
      return;
    }
    const rows = parseRows();
    if (!rows || rows.length === 0) {
      if (rows && rows.length === 0) setJsonError("No valid rows to import.");
      return;
    }
    setImporting(true);
    try {
      const res = await api.adminFeedImport({ sourceName: sourceName.trim(), items: rows });
      setImportResult(res);
      setFlash({ kind: "success", message: `Imported ${rows.length} rows from "${sourceName.trim()}".` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setImporting(false);
    }
  };

  const columns: Column<Feed>[] = [
    {
      key: "name",
      header: "Feed",
      render: (f) => (
        <div>
          <p className="font-medium text-slate-900">{f.name}</p>
          <a href={f.url} target="_blank" rel="noreferrer" className="block max-w-[320px] truncate text-xs text-slate-500 hover:text-brand-700" dir="ltr">
            {f.url}
          </a>
        </div>
      ),
    },
    { key: "format", header: "Format", render: (f) => <Badge tone="slate">{f.format.toUpperCase()}</Badge> },
    { key: "enabled", header: "Enabled", render: (f) => (f.enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="slate">Disabled</Badge>) },
    { key: "lastRun", header: "Last run", render: (f) => <span className="text-slate-600">{f.lastRunAt ? formatDateTime(f.lastRunAt, lang) : "Never"}</span> },
    { key: "status", header: t("common.status"), render: (f) => (f.lastStatus ? <Badge tone={statusTone(f.lastStatus)}>{f.lastStatus}</Badge> : <span className="text-slate-400">—</span>) },
    { key: "count", header: "Items", align: "end", render: (f) => <span className="tabular-nums">{formatNumber(f.lastItemCount ?? 0, lang)}</span> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (f) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => run(f)} loading={running === f.id} disabled={!!running && running !== f.id}>
            Run now
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(f)} loading={deleting === f.id}>
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  const list = feeds.data ?? [];
  const resultsToShow = list.filter((f) => runResults[f.id]);

  return (
    <div>
      <PageHeader title={t("admin.feeds")} subtitle="Collect construction products from external sources. Materials are created with source FEED and prices are stored as MARKET reference listings. Enabled feeds also run daily." />
      <FlashMessage flash={flash} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Feeds" subtitle={feeds.data ? `${list.length} configured` : undefined} />
          {feeds.loading ? (
            <LoadingBlock />
          ) : feeds.error ? (
            <div className="p-5">
              <Alert onRetry={feeds.reload}>{feeds.error}</Alert>
            </div>
          ) : (
            <Table columns={columns} rows={list} rowKey={(f) => f.id} empty={<EmptyState title="No feeds yet" description="Add a JSON or CSV source on the right and run it." />} />
          )}
          {resultsToShow.length > 0 && (
            <div className="space-y-3 border-t border-slate-100 px-5 py-4">
              <h4 className="text-sm font-semibold text-slate-900">Latest run results</h4>
              {resultsToShow.map((f) => {
                const r = runResults[f.id];
                return (
                  <div key={f.id} className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{f.name}</p>
                    {"error" in r ? <p className="text-sm text-red-700">{r.error}</p> : <ResultSummary result={r} />}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Add feed" subtitle="The URL must return rows with sku, name, category, unit, price, city (+ optional nameAr, brand, imageUrl, stock)." />
          <CardBody>
            <form onSubmit={create} noValidate className="space-y-4">
              <Input label="Name" name="feedName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={formErrors.name} placeholder="e.g. Supplier XYZ catalogue" required />
              <Input label="URL" name="feedUrl" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} error={formErrors.url} placeholder="https://example.com/products.json" dir="ltr" required />
              <Select label="Format" name="feedFormat" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value === "csv" ? "csv" : "json" })} options={[{ value: "json", label: "JSON" }, { value: "csv", label: "CSV" }]} />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                Enabled (runs daily)
              </label>
              <Button type="submit" className="w-full" loading={creating}>
                Create feed
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Inline import"
          subtitle="Paste rows as JSON to import once without configuring a URL. Same row format as feeds."
          action={
            <Button size="sm" variant="ghost" onClick={() => setJson(JSON.stringify(SAMPLE_ROWS, null, 2))}>
              Insert sample
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <Input label="Source name" name="sourceName" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. Manual import Sept 2026" required className="max-w-md" />
          <Textarea
            label="Rows (JSON array)"
            name="json"
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setJsonError(null);
              setImportResult(null);
            }}
            rows={12}
            className="font-mono text-xs"
            placeholder={'[\n  { "sku": "EXT-001", "name": "…", "category": "cement", "unit": "bag", "price": 18.5, "city": "Riyadh" }\n]'}
            error={jsonError}
            dir="ltr"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => { const rows = parseRows(); if (rows) setFlash({ kind: "success", message: `${rows.length} valid rows.` }); }} disabled={!json.trim()}>
              Validate
            </Button>
            <Button onClick={importInline} loading={importing} disabled={!json.trim()}>
              Import rows
            </Button>
          </div>
          {importResult && (
            <Alert kind={(importResult.errors ?? []).length ? "warning" : "success"}>
              <ResultSummary result={importResult} />
            </Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
