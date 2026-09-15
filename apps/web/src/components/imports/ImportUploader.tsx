"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { SAUDI_CITIES, type ImportKind, type PriceImport } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/format";
import { Alert, Badge, Button, Input, Label, Select, Spinner, Textarea } from "@/components/ui";

const ACCEPT = ".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp";
const ACCEPTED_EXT = ["pdf", "xlsx", "xls", "csv", "png", "jpg", "jpeg", "webp"];
const DEFAULT_MAX_MB = 15;
const AI_ONLY_EXT = ["pdf", "png", "jpg", "jpeg", "webp"];

export interface ImportUploaderProps {
  kind: ImportKind;
  onCreated: (imp: PriceImport) => void;
  /** Preselected city (e.g. the supplier's company city). */
  defaultCity?: string;
  /** Show a "Source name" field (admin bulk paste). Defaults to true for kind TEXT. */
  withSourceName?: boolean;
  className?: string;
}

type Mode = "file" | "text";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function ImportUploader({ kind, onCreated, defaultCity = "", withSourceName, className }: ImportUploaderProps) {
  const config = useAsync(() => api.aiConfig(), []);
  const aiEnabled = config.data?.enabled ?? null; // null = unknown (loading / failed)
  const maxMb = config.data?.maxFileMb ?? DEFAULT_MAX_MB;

  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [sourceName, setSourceName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [quotationDate, setQuotationDate] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    if (defaultCity && !city) setCity(defaultCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCity]);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const handle = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(handle);
  }, [busy]);

  const showSourceName = withSourceName ?? kind === "TEXT";
  const isQuotation = kind === "BUYER_QUOTATION";

  const pickFile = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    const ext = extOf(f.name);
    if (!ACCEPTED_EXT.includes(ext)) {
      setError(`"${f.name}" is not supported. Upload a PDF, Excel, CSV or image (${ACCEPT}).`);
      return;
    }
    if (f.size > maxMb * 1024 * 1024) {
      setError(`"${f.name}" is ${formatBytes(f.size)}; the limit is ${maxMb} MB.`);
      return;
    }
    if (aiEnabled === false && AI_ONLY_EXT.includes(ext)) {
      setError("AI reading is not configured on this server, so PDFs and photos cannot be read. Upload a CSV / Excel file or paste the text instead.");
    }
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (mode === "file" && !file) errs.file = "Choose a file to read.";
    if (mode === "text" && text.trim().length < 5) errs.text = "Paste the price list text first.";
    if (isQuotation && !supplierName.trim()) errs.supplierName = "Enter the supplier who issued the quotation.";
    if (mode === "file" && file && aiEnabled === false && AI_ONLY_EXT.includes(extOf(file.name))) {
      errs.file = "PDFs and photos need AI, which is not configured. Use CSV / Excel or paste text.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    const fd = new FormData();
    fd.append("kind", kind);
    if (mode === "file" && file) fd.append("file", file, file.name);
    else fd.append("text", text.trim());
    if (city) fd.append("city", city);
    if (sourceName.trim()) fd.append("sourceName", sourceName.trim());
    if (isQuotation) {
      fd.append("supplierName", supplierName.trim());
      if (quotationDate) fd.append("quotationDate", quotationDate);
    }
    setBusy(true);
    try {
      const created = await api.createImport(fd);
      setFile(null);
      setText("");
      if (inputRef.current) inputRef.current.value = "";
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err, "Could not read the document."));
    } finally {
      setBusy(false);
    }
  };

  const tabClass = (active: boolean) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm font-medium transition",
      active ? "bg-white text-brand-700 shadow-sm ring-1 ring-inset ring-slate-200" : "text-slate-600 hover:text-slate-900",
    );

  return (
    <form onSubmit={submit} noValidate className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Import method">
          <button type="button" role="tab" aria-selected={mode === "file"} className={tabClass(mode === "file")} onClick={() => setMode("file")}>
            Upload file
          </button>
          <button type="button" role="tab" aria-selected={mode === "text"} className={tabClass(mode === "text")} onClick={() => setMode("text")}>
            Paste text
          </button>
        </div>
        {config.loading ? (
          <span className="text-xs text-slate-400">Checking AI…</span>
        ) : aiEnabled ? (
          <Badge tone="purple" className="gap-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI reading enabled{config.data?.model ? ` · ${config.data.model}` : ""}
          </Badge>
        ) : null}
      </div>

      {aiEnabled === false && (
        <Alert kind="warning">AI not configured: paste text or upload CSV/Excel; PDFs and photos need AI.</Alert>
      )}
      {config.error && !config.loading && <Alert kind="info">Could not check AI availability ({config.error}). You can still try uploading.</Alert>}

      {mode === "file" ? (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-describedby={`${uid}-hint`}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
              dragging ? "border-brand-600 bg-brand-50" : fieldErrors.file ? "border-red-300 bg-red-50/40" : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40",
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </span>
            <p className="mt-3 text-sm font-medium text-slate-900">Drag & drop your price list here, or click to browse</p>
            <p id={`${uid}-hint`} className="mt-1 text-xs text-slate-500">
              PDF, Excel (.xlsx/.xls), CSV or a photo (.png/.jpg/.webp) · up to {maxMb} MB
            </p>
            <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} tabIndex={-1} />
          </div>
          {file && (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-brand-700" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="truncate font-medium text-slate-900" dir="ltr">{file.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span>
              <button
                type="button"
                aria-label="Remove file"
                className="ms-1 shrink-0 rounded-md p-0.5 text-slate-500 hover:bg-white hover:text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          )}
          {fieldErrors.file && <p className="mt-1 text-xs text-red-600">{fieldErrors.file}</p>}
        </div>
      ) : (
        <Textarea
          label="Price list text"
          name={`${uid}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"Paste rows in any format, e.g.\nPortland cement OPC 50kg bag  18.50\nRebar 12mm B500B  ton  2,650\nBlock 20cm hollow  piece  2.9"}
          hint="Any layout works: WhatsApp messages, emails, copied spreadsheets or price tables."
          error={fieldErrors.text}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Select label="City" name={`${uid}-city`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Not specified" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
        {isQuotation && (
          <>
            <Input label="Supplier (who issued it)" name={`${uid}-supplier`} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Al Rajhi Building Materials" error={fieldErrors.supplierName} required />
            <Input label="Quotation date" name={`${uid}-qdate`} type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} dir="ltr" />
          </>
        )}
        {showSourceName && (
          <Input label="Source name" name={`${uid}-source`} value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. Supplier XYZ price list Sept 2026" hint="Shown as the source of the published prices." />
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={busy} variant="accent">
          {busy ? "Reading…" : "Read prices"}
        </Button>
        {busy ? (
          <span className="inline-flex items-center gap-2 text-sm text-slate-600" role="status">
            <Spinner size="sm" /> Reading your document… this takes 10–60 seconds{elapsed > 0 ? ` (${elapsed}s)` : ""}
          </span>
        ) : (
          <span className="text-xs text-slate-500">Nothing is published until you review and approve the extracted rows.</span>
        )}
      </div>
    </form>
  );
}
