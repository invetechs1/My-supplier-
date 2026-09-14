"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BoqAnalysis, BoqLineInput } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Alert, Button, Card, CardHeader, LinkButton, PageHeader, Spinner } from "@/components/ui";
import { BoqInput, type BoqInputValue } from "@/components/boq/BoqInput";
import { BoqSummary } from "@/components/boq/BoqSummary";
import { BoqLinesTable } from "@/components/boq/BoqLinesTable";
import { BoqSuppliers } from "@/components/boq/BoqSuppliers";
import { BoqRfqModal } from "@/components/boq/BoqRfqModal";

const DRAFT_KEY = "ms_boq_draft";

function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function BoqPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [input, setInput] = useState<BoqInputValue>({ text: "", city: "", verifiedOnly: false });
  const [lines, setLines] = useState<BoqLineInput[] | null>(null); // parsed lines incl. user pins
  const [analysis, setAnalysis] = useState<BoqAnalysis | null>(null);
  const [step, setStep] = useState<"input" | "results">("input");
  const [loading, setLoading] = useState(false);
  const [repinning, setRepinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rfqOpen, setRfqOpen] = useState(false);

  // Restore a draft (e.g. after logging in to send the RFQ).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<BoqInputValue>;
        setInput((prev) => ({ ...prev, ...draft }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const runAnalysis = useCallback(
    async (body: { text?: string; lines?: BoqLineInput[] }, isRepin = false) => {
      if (isRepin) setRepinning(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await api.boqAnalyze({ ...body, city: input.city || undefined, verifiedOnly: input.verifiedOnly || undefined });
        setAnalysis(result);
        // Keep an editable line list in sync with what the server matched.
        setLines(
          result.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            materialId: l.match?.material.id,
          })),
        );
        setStep("results");
        try {
          window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(input));
        } catch {
          /* ignore */
        }
      } catch (err) {
        setError(errorMessage(err, "Could not analyse the BOQ"));
      } finally {
        setLoading(false);
        setRepinning(false);
      }
    },
    [input],
  );

  const analyze = () => {
    if (!input.text.trim()) {
      setError("Paste at least one BOQ line.");
      return;
    }
    void runAnalysis({ text: input.text });
  };

  const repin = (index: number, materialId: string) => {
    if (!lines) return;
    const next = lines.map((l, i) => (i === index ? { ...l, materialId } : l));
    setLines(next);
    void runAnalysis({ lines: next }, true);
  };

  const downloadCsv = () => {
    if (!analysis) return;
    const header = ["#", "Description", "Quantity", "Unit", "Matched material", "SKU", "Confidence", "Best supplier", "Supplier city", "Unit price (SAR)", "Line total (SAR)", "Lead time (days)"];
    const rows = analysis.lines.map((l) => [
      l.index + 1,
      l.description,
      l.quantity,
      l.unit,
      l.match?.material.name ?? "",
      l.match?.material.sku ?? "",
      l.match ? Math.round(l.match.confidence * 100) + "%" : "",
      l.bestOffer?.supplierName ?? "",
      l.bestOffer?.city ?? "",
      l.bestOffer?.price ?? "",
      l.bestOffer?.lineTotal ?? "",
      l.bestOffer?.leadTimeDays ?? "",
    ]);
    rows.push([]);
    rows.push(["", "Cheapest total", "", "", "", "", "", "", "", "", analysis.summary.cheapestTotal, ""]);
    rows.push(["", "Average market total", "", "", "", "", "", "", "", "", analysis.summary.averageTotal, ""]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boq-prices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const rfqLines = useMemo<BoqLineInput[]>(() => (lines ?? []).map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, materialId: l.materialId })), [lines]);
  const canSendRfq = !!user && (user.role === "BUYER" || user.role === "ADMIN");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={t("boq.title")}
        subtitle="Paste a bill of quantities and see the cheapest total, the best single supplier and where to buy every line — no sign-up needed."
        action={
          step === "results" ? (
            <Button variant="outline" onClick={() => setStep("input")}>← Edit BOQ</Button>
          ) : undefined
        }
      />

      {step === "input" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BoqInput value={input} onChange={setInput} onSubmit={analyze} loading={loading} error={error} />
          </div>
          <aside className="space-y-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900">What you get</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex gap-2"><span className="text-brand-600">✓</span> Every line matched to a catalogue material (fix matches manually)</li>
                <li className="flex gap-2"><span className="text-brand-600">✓</span> All supplier and market offers per line, sorted by price</li>
                <li className="flex gap-2"><span className="text-brand-600">✓</span> Cheapest mixed-supplier total vs. best single supplier</li>
                <li className="flex gap-2"><span className="text-brand-600">✓</span> One click to send the whole BOQ as an RFQ</li>
              </ul>
            </Card>
            <Card className="p-5 text-sm text-slate-600">
              <h3 className="text-sm font-semibold text-slate-900">Tips</h3>
              <p className="mt-2">Include size or grade (e.g. <em>16mm</em>, <em>C30</em>, <em>OPC 50kg</em>) for better matches. Units like ton, kg, bag, m3, m2, piece are recognised in English and Arabic.</p>
            </Card>
          </aside>
        </div>
      )}

      {step === "results" && analysis && (
        <div className="space-y-6">
          {error && <Alert onRetry={() => (lines ? runAnalysis({ lines }, true) : analyze())}>{error}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              {analysis.city ? `Prices for ${analysis.city}` : "Prices across all cities"}
              {input.verifiedOnly && " · verified suppliers only"} · generated {formatDateTime(analysis.generatedAt, lang)}
            </span>
            {repinning && <span className="inline-flex items-center gap-2 text-brand-700"><Spinner size="sm" /> Updating…</span>}
          </div>

          <BoqSummary analysis={analysis} lang={lang} />

          <div className="flex flex-wrap gap-3">
            {canSendRfq ? (
              <Button variant="accent" size="lg" onClick={() => setRfqOpen(true)} disabled={rfqLines.length === 0}>Send as RFQ to suppliers</Button>
            ) : user ? (
              <span className="text-sm text-slate-500">Log in as a buyer to send this BOQ as an RFQ.</span>
            ) : (
              <LinkButton href="/login?redirect=/boq" variant="accent" size="lg">Log in to send as RFQ</LinkButton>
            )}
            <Button variant="outline" size="lg" onClick={downloadCsv}>Download CSV</Button>
            <Button variant="ghost" size="lg" onClick={() => setStep("input")}>Edit BOQ</Button>
          </div>

          <Card>
            <CardHeader title="Lines" subtitle="Best offer per line. Change a match to re-price that line." />
            <BoqLinesTable lines={analysis.lines} lang={lang} onRepin={repin} repinning={repinning} />
          </Card>

          <Card>
            <CardHeader title="Where to buy" subtitle="Suppliers ranked by coverage and total for the lines they can supply." />
            <BoqSuppliers suppliers={analysis.suppliers} bestId={analysis.summary.bestSingleSupplier?.supplierId ?? null} lineCount={analysis.lineCount} lang={lang} />
          </Card>

          {analysis.unmatchedLines > 0 && (
            <Alert kind="warning">
              {analysis.unmatchedLines} line{analysis.unmatchedLines === 1 ? " was" : "s were"} not matched to a catalogue material. Pick a material from the dropdown, or{" "}
              <Link href="/materials" className="font-semibold underline">browse the catalogue</Link> to find the right SKU.
            </Alert>
          )}
        </div>
      )}

      <BoqRfqModal open={rfqOpen} onClose={() => setRfqOpen(false)} lines={rfqLines} defaultCity={input.city} />
    </div>
  );
}
