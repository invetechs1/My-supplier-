"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage, type ImportPriceRow } from "@/lib/api";
import { useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, CardHeader, FlashMessage, Input, PageHeader, Textarea } from "@/components/ui";
import { ImportList, ImportUploader } from "@/components/imports";

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

/** Legacy SKU-keyed CSV import (POST /admin/prices/import) kept for exact-SKU sources such as GASTAT. */
function LegacySkuImport() {
  const [open, setOpen] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash(8000);

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
      setFlash({ kind: "success", message: `Imported ${count} listings from "${sourceName.trim()}"${res.skipped ? ` (${res.skipped} skipped)` : ""}.` });
      setCsv("");
      setParsed(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader
        title="Direct SKU import (no review)"
        subtitle="For sources that already use catalogue SKUs: sku,price,city[,minQty,leadTimeDays]. Publishes MARKET listings immediately."
        action={
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"}
          </Button>
        }
      />
      {open && (
        <CardBody className="space-y-4">
          <FlashMessage flash={flash} />
          <Input label="Source name" name="legacySourceName" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. GASTAT construction index, Q3 2026" required className="max-w-md" />
          <Textarea
            label="CSV rows"
            name="legacyCsv"
            hint="A header row is ignored."
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setParsed(null);
            }}
            rows={8}
            className="font-mono text-xs"
            placeholder={"sku,price,city,minQty,leadTimeDays\nCEM-OPC-50,18.75,Riyadh,100,2\nSTL-RB-12,2680,Jeddah,5,7"}
            dir="ltr"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setParsed(parseCsv(csv))} disabled={!csv.trim()}>
              Validate
            </Button>
            <Button onClick={submit} loading={busy} disabled={!csv.trim()}>
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
        </CardBody>
      )}
    </Card>
  );
}

export default function AdminImportsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <PageHeader title={t("admin.imports")} subtitle="Every AI-read document lands here for review: supplier price lists, buyer quotations, scraped web pages and pasted text. Nothing is published until a row is approved." />

      <ImportList area="admin" refreshKey={refreshKey} title="Review queue" />

      <Card className="mt-6">
        <CardHeader title="Bulk paste (admin)" subtitle="Paste any price text or upload a document. Rows publish as MARKET listings attributed to the source name." />
        <CardBody>
          <ImportUploader
            kind="TEXT"
            withSourceName
            onCreated={(imp) => {
              setRefreshKey((k) => k + 1);
              router.push(`/admin/imports/${imp.id}`);
            }}
          />
        </CardBody>
      </Card>

      <LegacySkuImport />
    </div>
  );
}
