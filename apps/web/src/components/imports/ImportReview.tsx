"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, UNITS, type ImportKind, type Material, type PriceImport, type PriceImportRow, type PublishImportResult } from "@mysupplier/shared";
import { api, errorMessage, type ImportRowPatch } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, FlashMessage, LinkButton, LoadingBlock, Modal, StatusBadge } from "@/components/ui";
import { MaterialAutocomplete } from "@/components/MaterialAutocomplete";

export type ImportArea = "supplier" | "buyer" | "admin";

export const KIND_LABEL: Record<ImportKind, string> = {
  SUPPLIER_PRICE_LIST: "Supplier price list",
  BUYER_QUOTATION: "Quotation",
  WEB_PAGE: "Web page",
  TEXT: "Pasted text",
};
export const KIND_TONE: Record<ImportKind, "green" | "purple" | "blue" | "slate"> = {
  SUPPLIER_PRICE_LIST: "green",
  BUYER_QUOTATION: "purple",
  WEB_PAGE: "blue",
  TEXT: "slate",
};

const CONFIDENCE_OPTIONS = [60, 70, 80, 90];

const AREA_LINKS: Record<ImportArea, { href: string; label: string }> = {
  supplier: { href: "/supplier/prices", label: "View my price list" },
  buyer: { href: "/materials", label: "Browse market prices" },
  admin: { href: "/admin/materials", label: "Open materials admin" },
};

export function ConfidenceBadge({ row }: { row: Pick<PriceImportRow, "materialId" | "confidence"> }) {
  if (!row.materialId) return <Badge tone="slate">No match</Badge>;
  const pct = Math.round((row.confidence ?? 0) * 100);
  const tone = row.confidence >= 0.8 ? "green" : row.confidence >= 0.5 ? "amber" : "red";
  return (
    <Badge tone={tone} className="tabular-nums" title="Match confidence">
      {pct}%
    </Badge>
  );
}

function publishExplanation(kind: ImportKind): string {
  switch (kind) {
    case "SUPPLIER_PRICE_LIST":
      return "Approved rows become your company's live SUPPLIER listings (one per material and city). Existing listings for the same material and city are updated. They appear immediately in the shop, on material pages and in the market index.";
    case "BUYER_QUOTATION":
      return "Approved rows are added to the market data as QUOTATION listings attributed to the quoting supplier, labelled “Quoted” so every contractor can see a price a buyer actually received. Your identity is not shown.";
    case "WEB_PAGE":
      return "Approved rows become MARKET reference listings attributed to the source web page.";
    default:
      return "Approved rows become MARKET reference listings attributed to the source name.";
  }
}

interface RowProps {
  row: PriceImportRow;
  readOnly: boolean;
  error?: string | null;
  saving: boolean;
  onPatch: (row: PriceImportRow, patch: ImportRowPatch, optimistic: Partial<PriceImportRow>) => void;
}

function ReviewRow({ row, readOnly, error, saving, onPatch }: RowProps) {
  const { lang } = useI18n();
  const [changing, setChanging] = useState(false);
  const [priceDraft, setPriceDraft] = useState<string>(row.price === null || row.price === undefined ? "" : String(row.price));

  // Keep the draft in sync when the row's price changes from outside (server response, revert).
  useEffect(() => {
    setPriceDraft(row.price === null || row.price === undefined ? "" : String(row.price));
  }, [row.price]);

  const commitPrice = () => {
    const trimmed = priceDraft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 0)) return;
    if (next === row.price) return;
    onPatch(row, { price: next }, { price: next });
  };

  const pinMaterial = (m: Material) => {
    setChanging(false);
    onPatch(row, { materialId: m.id }, { materialId: m.id, material: m, confidence: 1 });
  };

  const units = UNITS.includes(row.unit as (typeof UNITS)[number]) || !row.unit ? [...UNITS] : [row.unit, ...UNITS];
  const cities = row.city && !(SAUDI_CITIES as readonly string[]).includes(row.city) ? [row.city, ...SAUDI_CITIES] : [...SAUDI_CITIES];
  const disabled = readOnly || saving || row.status === "PUBLISHED";
  const controlClass = "block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50 disabled:text-slate-500";
  const rowTone = row.status === "REJECTED" ? "bg-slate-50/80 text-slate-400" : row.status === "APPROVED" || row.status === "PUBLISHED" ? "bg-emerald-50/30" : "";

  return (
    <>
      <tr className={cn("align-top", rowTone, saving && "opacity-70")}>
        <td className="px-4 py-3">
          <p className={cn("font-medium", row.status === "REJECTED" ? "line-through" : "text-slate-900")}>{row.rawName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {[row.rawUnit, row.rawPrice, row.rawCity, row.brand].filter(Boolean).join(" · ") || "—"}
          </p>
          {row.notes && <p className="mt-0.5 text-xs italic text-slate-400">{row.notes}</p>}
        </td>
        <td className="min-w-[240px] px-4 py-3">
          {changing ? (
            <div className="space-y-1">
              <MaterialAutocomplete value={null} onChange={(m) => m && pinMaterial(m)} placeholder="Search catalogue…" />
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setChanging(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {row.material ? (
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{row.material.name}</p>
                    <p className="text-xs text-slate-500" dir="auto">
                      {row.material.nameAr}
                      {row.material.nameAr ? " · " : ""}
                      <span dir="ltr">{row.material.sku}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No catalogue match</p>
                )}
                <ConfidenceBadge row={row} />
                {!disabled && (
                  <button type="button" onClick={() => setChanging(true)} className="text-xs font-semibold text-brand-700 hover:underline">
                    Change
                  </button>
                )}
              </div>
              {!disabled && row.alternatives && row.alternatives.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">Alternatives</span>
                  {row.alternatives.slice(0, 3).map((alt) => (
                    <button
                      key={alt.material.id}
                      type="button"
                      onClick={() => pinMaterial(alt.material)}
                      title={`${alt.material.sku} · ${Math.round(alt.confidence * 100)}% — click to pin`}
                      className="max-w-[180px] truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:border-brand-400 hover:text-brand-700"
                    >
                      {alt.material.name} <span className="text-slate-400">{Math.round(alt.confidence * 100)}%</span>
                    </button>
                  ))}
                </div>
              )}
              {!row.materialId && !disabled && (
                <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.createMaterial}
                    onChange={(e) => onPatch(row, { createMaterial: e.target.checked }, { createMaterial: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                  />
                  Create as new catalogue item
                </label>
              )}
              {!row.materialId && row.createMaterial && disabled && <Badge tone="blue" className="mt-1">New item</Badge>}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step="0.01"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={disabled}
              dir="ltr"
              aria-label="Price (SAR)"
              className={cn(controlClass, "w-28 text-end tabular-nums")}
            />
            <span className="text-xs text-slate-500">SAR</span>
          </div>
          {row.price !== null && row.price !== undefined && <p className="mt-1 text-[11px] text-slate-400">{formatSar(row.price, lang)}</p>}
        </td>
        <td className="px-4 py-3">
          <select value={row.unit ?? ""} onChange={(e) => onPatch(row, { unit: e.target.value }, { unit: e.target.value })} disabled={disabled} aria-label="Unit" className={cn(controlClass, "w-28 pe-7")}>
            {!row.unit && <option value="">—</option>}
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3">
          <select
            value={row.city ?? ""}
            onChange={(e) => onPatch(row, { city: e.target.value || null }, { city: e.target.value || null })}
            disabled={disabled}
            aria-label="City"
            className={cn(controlClass, "w-36 pe-7")}
          >
            <option value="">—</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-3">
          {!disabled && (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                title="Approve"
                aria-label="Approve row"
                disabled={row.status === "APPROVED"}
                onClick={() => onPatch(row, { status: "APPROVED" }, { status: "APPROVED" })}
                className={cn("rounded-lg p-1.5 transition", row.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700")}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                type="button"
                title="Reject"
                aria-label="Reject row"
                disabled={row.status === "REJECTED"}
                onClick={() => onPatch(row, { status: "REJECTED" }, { status: "REJECTED" })}
                className={cn("rounded-lg p-1.5 transition", row.status === "REJECTED" ? "bg-red-100 text-red-700" : "text-slate-500 hover:bg-red-50 hover:text-red-700")}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
              {row.status === "REJECTED" || row.status === "APPROVED" ? (
                <button type="button" title="Back to suggested" className="rounded-lg px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100" onClick={() => onPatch(row, { status: "SUGGESTED" }, { status: "SUGGESTED" })}>
                  Undo
                </button>
              ) : null}
            </div>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="px-4 pb-2 pt-0">
            <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}

export function ImportReview({ importId, area }: { importId: string; area: ImportArea }) {
  const { lang } = useI18n();
  const state = useAsync(() => api.importDetail(importId), [importId]);
  const imp = state.data;
  const [flash, setFlash] = useFlash(6000);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [minConf, setMinConf] = useState(80);
  const [approvingAll, setApprovingAll] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [includeSuggested, setIncludeSuggested] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [published, setPublished] = useState<PublishImportResult | null>(null);
  const [filter, setFilter] = useState<"all" | "matched" | "review" | "unmatched" | "approved" | "rejected">("all");

  const setImport = state.setData;

  const applyRow = useCallback(
    (rowId: string, patch: Partial<PriceImportRow>) => {
      setImport((prev) => (prev ? { ...prev, rows: (prev.rows ?? []).map((r) => (r.id === rowId ? { ...r, ...patch } : r)) } : prev));
    },
    [setImport],
  );

  const patchRow = useCallback(
    async (row: PriceImportRow, patch: ImportRowPatch, optimistic: Partial<PriceImportRow>) => {
      const snapshot = { ...row };
      setRowErrors((e) => ({ ...e, [row.id]: "" }));
      setSavingRows((s) => ({ ...s, [row.id]: true }));
      applyRow(row.id, optimistic);
      try {
        const updated = await api.updateImportRow(importId, row.id, patch);
        applyRow(row.id, { ...updated, material: updated.material ?? optimistic.material ?? snapshot.material, alternatives: updated.alternatives ?? snapshot.alternatives });
      } catch (err) {
        applyRow(row.id, snapshot);
        setRowErrors((e) => ({ ...e, [row.id]: errorMessage(err, "Could not save this row.") }));
      } finally {
        setSavingRows((s) => ({ ...s, [row.id]: false }));
      }
    },
    [applyRow, importId],
  );

  const rows = useMemo(() => imp?.rows ?? [], [imp]);
  const counts = useMemo(() => {
    const c = { matched: 0, review: 0, unmatched: 0, approved: 0, rejected: 0, published: 0, suggestedAbove: 0 };
    rows.forEach((r) => {
      if (!r.materialId) c.unmatched += 1;
      else if (r.confidence >= 0.8) c.matched += 1;
      else c.review += 1;
      if (r.status === "APPROVED") c.approved += 1;
      if (r.status === "REJECTED") c.rejected += 1;
      if (r.status === "PUBLISHED") c.published += 1;
      if (r.status === "SUGGESTED" && (r.materialId || r.createMaterial) && r.confidence >= minConf / 100) c.suggestedAbove += 1;
    });
    return c;
  }, [rows, minConf]);

  const visible = rows.filter((r) => {
    switch (filter) {
      case "matched":
        return !!r.materialId && r.confidence >= 0.8;
      case "review":
        return !!r.materialId && r.confidence < 0.8 && r.status !== "REJECTED";
      case "unmatched":
        return !r.materialId;
      case "approved":
        return r.status === "APPROVED" || r.status === "PUBLISHED";
      case "rejected":
        return r.status === "REJECTED";
      default:
        return true;
    }
  });

  const readOnly = !imp || imp.status === "PUBLISHED" || imp.status === "REJECTED" || imp.status === "PROCESSING" || imp.status === "FAILED";

  const approveAll = async () => {
    if (!imp) return;
    setApprovingAll(true);
    try {
      const res = await api.approveAllRows(imp.id, minConf / 100);
      if (res.rows) setImport(res);
      else state.reload();
      setFlash({ kind: "success", message: `Approved every suggested row matched at ${minConf}% or better.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setApprovingAll(false);
    }
  };

  const publish = async () => {
    if (!imp) return;
    setPublishing(true);
    try {
      const res = await api.publishImport(imp.id, { includeSuggested, minConfidence: minConf / 100 });
      setPublished(res);
      if (res.import?.rows) setImport(res.import);
      else if (res.import) setImport((prev) => (prev ? { ...prev, ...res.import, rows: prev.rows } : res.import));
      else state.reload();
      setPublishOpen(false);
      setFlash({ kind: "success", message: `${res.published} price${res.published === 1 ? "" : "s"} published.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setPublishing(false);
    }
  };

  const reject = async () => {
    if (!imp) return;
    if (!window.confirm("Reject this whole import? Nothing will be published and the rows are kept for reference.")) return;
    setRejecting(true);
    try {
      const res = await api.rejectImport(imp.id);
      setImport((prev) => (prev ? { ...prev, ...res, rows: res.rows ?? prev.rows } : res));
      setFlash({ kind: "success", message: "Import rejected." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setRejecting(false);
    }
  };

  if (state.loading && !imp) return <LoadingBlock label="Loading import…" />;
  if (state.error || !imp) return <Alert onRetry={state.reload}>{state.error ?? "Import not found"}</Alert>;

  const publishable = counts.approved + (includeSuggested ? counts.suggestedAbove : 0);
  const link = AREA_LINKS[area];

  const chip = (key: typeof filter, label: string, value: number, tone: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(filter === key ? "all" : key)}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition", filter === key ? "border-brand-600 bg-brand-600 text-white" : cn("border-transparent", tone))}
    >
      {label} <span className="tabular-nums font-semibold">{value}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-slate-900">{imp.sourceName || imp.fileName || "Import"}</h2>
                <Badge tone={KIND_TONE[imp.kind] ?? "slate"}>{KIND_LABEL[imp.kind] ?? imp.kind}</Badge>
                <StatusBadge status={imp.status} />
                {imp.aiUsed && (
                  <Badge tone="purple" title={imp.model ?? undefined}>
                    AI{imp.model ? ` · ${imp.model}` : ""}
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-500">
                {imp.fileName && <span dir="ltr">{imp.fileName}</span>}
                {imp.supplierName && <span>Supplier: {imp.supplierName}</span>}
                {imp.company?.name && !imp.supplierName && <span>Company: {imp.company.name}</span>}
                {imp.city && <span>{imp.city}</span>}
                {imp.quotationDate && <span>Quoted {formatDateTime(imp.quotationDate, lang)}</span>}
                <span>
                  {imp.extractedCount} row{imp.extractedCount === 1 ? "" : "s"} extracted
                </span>
                {imp.publishedCount > 0 && <span>{imp.publishedCount} published</span>}
                {imp.uploadedBy && area === "admin" && <span>by {imp.uploadedBy.name}</span>}
                <span>{formatDateTime(imp.createdAt, lang)}</span>
              </p>
              {imp.error && <Alert kind="error" className="mt-2">{imp.error}</Alert>}
            </div>
            <div className="flex flex-wrap gap-2">
              {chip("matched", "Matched ≥80%", counts.matched, "bg-emerald-50 text-emerald-700")}
              {chip("review", "Needs review", counts.review, "bg-amber-50 text-amber-800")}
              {chip("unmatched", "Unmatched", counts.unmatched, "bg-slate-100 text-slate-700")}
              {chip("approved", "Approved", counts.approved + counts.published, "bg-sky-50 text-sky-700")}
              {chip("rejected", "Rejected", counts.rejected, "bg-red-50 text-red-700")}
            </div>
          </div>
        </CardBody>
      </Card>

      <FlashMessage flash={flash} />

      {published && (
        <Alert kind={published.published > 0 ? "success" : "warning"}>
          <p className="font-semibold">
            Published {published.published} price{published.published === 1 ? "" : "s"}
            {published.skipped ? ` · ${published.skipped} skipped` : ""}
            {published.createdMaterials ? ` · ${published.createdMaterials} new catalogue item${published.createdMaterials === 1 ? "" : "s"}` : ""}
          </p>
          <p className="mt-1 text-xs">
            {imp.kind === "BUYER_QUOTATION" ? "Thanks — these quoted prices now help every contractor benchmark this supplier." : "Prices are live and included in the market index."}{" "}
            <Link href={link.href} className="font-semibold underline underline-offset-2">
              {link.label} →
            </Link>
          </p>
        </Alert>
      )}

      {!readOnly && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Min confidence</span>
              <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20">
                {CONFIDENCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}%
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" size="sm" onClick={approveAll} loading={approvingAll} disabled={counts.suggestedAbove === 0}>
              Approve all ≥ {minConf}% ({counts.suggestedAbove})
            </Button>
            <Button size="sm" onClick={() => setPublishOpen(true)} disabled={counts.approved === 0 && counts.suggestedAbove === 0}>
              Publish approved ({counts.approved})
            </Button>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" className="text-red-600" onClick={reject} loading={rejecting}>
              Reject import
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-start">Extracted text</th>
                <th className="px-4 py-3 text-start">Catalogue match</th>
                <th className="px-4 py-3 text-start">Price</th>
                <th className="px-4 py-3 text-start">Unit</th>
                <th className="px-4 py-3 text-start">City</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">{readOnly ? "" : "Approve / Reject"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    {rows.length === 0 ? "No rows were extracted from this document." : "No rows match this filter."}
                  </td>
                </tr>
              ) : (
                visible.map((row) => <ReviewRow key={row.id} row={row} readOnly={readOnly} error={rowErrors[row.id]} saving={!!savingRows[row.id]} onPatch={patchRow} />)
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Showing {visible.length} of {rows.length} rows · edits save automatically
          </div>
        )}
      </Card>

      {readOnly && !published && (
        <div className="flex justify-end">
          <LinkButton href={link.href} variant="outline">
            {link.label}
          </LinkButton>
        </div>
      )}

      <Modal
        open={publishOpen}
        title="Publish approved prices"
        onClose={() => setPublishOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setPublishOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={publish} loading={publishing} disabled={publishable === 0}>
              Publish {publishable} row{publishable === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate-700">
          <p>{publishExplanation(imp.kind)}</p>
          <p>
            Rows with no catalogue match are skipped unless <em>Create as new item</em> is ticked, in which case a new catalogue item is created from the extracted text.
          </p>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <input type="checkbox" checked={includeSuggested} onChange={(e) => setIncludeSuggested(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            <span>
              Also include suggested rows matched at ≥ {minConf}% <span className="text-slate-500">({counts.suggestedAbove} row{counts.suggestedAbove === 1 ? "" : "s"})</span>
            </span>
          </label>
          <p className="text-xs text-slate-500">
            {counts.approved} approved{includeSuggested ? ` + ${counts.suggestedAbove} suggested` : ""} → {publishable} to publish.
          </p>
        </div>
      </Modal>
    </div>
  );
}
