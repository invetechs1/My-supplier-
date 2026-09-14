"use client";

import { useState } from "react";
import { api, errorMessage, type ImportPriceRow } from "@/lib/api";
import { useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, CardHeader, FlashMessage, Input, PageHeader, Textarea } from "@/components/ui";

interface Parsed {
  rows: ImportPriceRow[];
  errors: string[];
}

function parseCsv(text: string): Parsed {
  const rows: ImportPriceRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (i === 0 && /^sku\s*,/i.test(line)) return;
    const [sku, price, city, minQty, leadTimeDays] = line.split(",").map((s) => s.trim());
    const p = Number(price);
    if (!sku || !city || !price || Number.isNaN(p) || p <= 0) {
      errors.push(`Line ${i + 1}: expected "sku,price,city[,minQty,leadTimeDays]"`);
      return;
    }
    rows.push({ sku, price: p, city, minQty: minQty ? Number(minQty) || undefined : undefined, leadTimeDays: leadTimeDays ? Number(leadTimeDays) || undefined : undefined });
  });
  return { rows, errors };
}

export default function AdminImportsPage() {
  const { t } = useI18n();
  const [sourceName, setSourceName] = useState("");
  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash(8000);
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    if (!sourceName.trim()) {
      setFlash({ kind: "error", message: "Enter a source name (e.g. GASTAT, supplier catalogue)." });
      return;
    }
    const p = parsed ?? parseCsv(csv);
    setParsed(p);
    if (p.rows.length === 0) {
      setFlash({ kind: "error", message: "No valid rows to import." });
      return;
    }
    setBusy(true);
    try {
      const res = await api.adminImportPrices({ sourceName: sourceName.trim(), items: p.rows });
      const count = res.imported ?? res.upserted ?? p.rows.length;
      setResult(`Imported ${count} listings from "${sourceName.trim()}"${res.skipped ? ` (${res.skipped} skipped)` : ""}.`);
      setFlash({ kind: "success", message: "Import complete." });
      setCsv("");
      setParsed(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={t("admin.imports")} subtitle="Import MARKET price listings from external sources. Rows are matched to materials by SKU." />
      <FlashMessage flash={flash} className="mb-4" />
      {result && <Alert kind="success" className="mb-4">{result}</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Price import" />
          <CardBody className="space-y-4">
            <Input label="Source name" name="sourceName" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. GASTAT construction index, Q3 2026" required />
            <Textarea
              label="CSV rows"
              name="csv"
              hint="Format: sku,price,city[,minQty,leadTimeDays] — one row per line. A header row is ignored."
              value={csv}
              onChange={(e) => { setCsv(e.target.value); setParsed(null); }}
              rows={12}
              className="font-mono text-xs"
              placeholder={"sku,price,city,minQty,leadTimeDays\nCEM-OPC-50,18.75,Riyadh,100,2\nSTL-RB-12,2680,Jeddah,5,7"}
              required
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => setParsed(parseCsv(csv))} disabled={!csv.trim()}>Validate</Button>
              <Button onClick={submit} loading={busy} disabled={!csv.trim()}>Import{parsed ? ` ${parsed.rows.length} rows` : ""}</Button>
              {parsed && <span className="text-sm text-slate-600">{parsed.rows.length} valid · {parsed.errors.length} invalid</span>}
            </div>
            {parsed && parsed.errors.length > 0 && (
              <Alert kind="warning">
                <ul className="list-disc ps-4">{parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}{parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more</li>}</ul>
              </Alert>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Preview" subtitle={parsed ? `${parsed.rows.length} rows` : "Validate to preview"} />
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr><th className="px-3 py-2 text-start">SKU</th><th className="px-3 py-2 text-end">Price</th><th className="px-3 py-2 text-start">City</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(parsed?.rows ?? []).slice(0, 100).map((r, i) => (
                  <tr key={`${r.sku}-${r.city}-${i}`}>
                    <td className="px-3 py-1.5 font-mono">{r.sku}</td>
                    <td className="px-3 py-1.5 text-end tabular-nums">{r.price}</td>
                    <td className="px-3 py-1.5">{r.city}</td>
                  </tr>
                ))}
                {!parsed && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Nothing to preview</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
