"use client";

import Link from "next/link";
import { useState } from "react";
import type { ImportKind, ImportStatus, PriceImport } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, LoadingBlock, Pagination, Select, StatusBadge, Table, type Column } from "@/components/ui";
import { KIND_LABEL, KIND_TONE, type ImportArea } from "./ImportReview";

const STATUSES: ImportStatus[] = ["REVIEW", "PUBLISHED", "REJECTED", "FAILED", "PROCESSING"];
const KINDS: ImportKind[] = ["SUPPLIER_PRICE_LIST", "BUYER_QUOTATION", "WEB_PAGE", "TEXT"];

export const AREA_BASE: Record<ImportArea, string> = {
  supplier: "/supplier/imports",
  buyer: "/dashboard/quotations",
  admin: "/admin/imports",
};

export interface ImportListProps {
  area: ImportArea;
  /** Lock the list to one kind (hides the kind filter). */
  fixedKind?: ImportKind;
  /** Bump to refetch (e.g. after an upload). */
  refreshKey?: number;
  title?: string;
  /** Receives the total after each load (for count badges). */
  onTotal?: (total: number) => void;
}

export function ImportList({ area, fixedKind, refreshKey = 0, title = "Imports", onTotal }: ImportListProps) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<ImportStatus | "">("");
  const [kind, setKind] = useState<ImportKind | "">(fixedKind ?? "");
  const [page, setPage] = useState(1);
  const effectiveKind = fixedKind ?? kind;

  const state = useAsync(
    async () => {
      const res = await api.imports({ status, kind: effectiveKind, page });
      if (onTotal && !status) onTotal(res.total);
      return res;
    },
    [status, effectiveKind, page, refreshKey],
  );

  const base = AREA_BASE[area];
  const columns: Column<PriceImport>[] = [
    { key: "date", header: "Date", render: (i) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(i.createdAt, lang)}</span> },
    ...(fixedKind ? [] : [{ key: "kind", header: "Kind", render: (i: PriceImport) => <Badge tone={KIND_TONE[i.kind] ?? "slate"}>{KIND_LABEL[i.kind] ?? i.kind}</Badge> } as Column<PriceImport>]),
    {
      key: "source",
      header: "Source",
      render: (i) => (
        <div className="min-w-0">
          <Link href={`${base}/${i.id}`} className="font-medium text-slate-900 hover:text-brand-700">
            {i.sourceName || i.supplierName || i.fileName || "Untitled import"}
          </Link>
          <p className="truncate text-xs text-slate-500" dir="ltr">
            {i.fileName ?? (i.kind === "TEXT" ? "pasted text" : "")}
            {i.city ? ` · ${i.city}` : ""}
          </p>
        </div>
      ),
    },
    { key: "status", header: t("common.status"), render: (i) => <StatusBadge status={i.status} /> },
    {
      key: "counts",
      header: "Extracted / published",
      align: "end",
      render: (i) => (
        <span className="tabular-nums">
          {i.extractedCount} / <span className={i.publishedCount > 0 ? "font-semibold text-emerald-700" : "text-slate-400"}>{i.publishedCount}</span>
        </span>
      ),
    },
    ...(area === "admin"
      ? [
          {
            key: "uploader",
            header: "Uploaded by",
            render: (i: PriceImport) => (
              <span className="text-slate-600">
                {i.uploadedBy?.name ?? "—"}
                {i.uploadedBy?.role ? <span className="ms-1 text-xs text-slate-400">({i.uploadedBy.role.toLowerCase()})</span> : null}
              </span>
            ),
          } as Column<PriceImport>,
        ]
      : []),
    { key: "ai", header: "", render: (i) => (i.aiUsed ? <Badge tone="purple">AI</Badge> : null) },
    {
      key: "open",
      header: "",
      align: "end",
      render: (i) => (
        <Link href={`${base}/${i.id}`} className="text-sm font-semibold text-brand-700 hover:underline">
          {i.status === "REVIEW" ? "Review →" : "Open →"}
        </Link>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={state.data ? `${state.data.total} total` : undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <Select
              name="importStatus"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ImportStatus | "");
                setPage(1);
              }}
              placeholder="All statuses"
              options={STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
              className="w-40"
            />
            {!fixedKind && (
              <Select
                name="importKind"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as ImportKind | "");
                  setPage(1);
                }}
                placeholder="All kinds"
                options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                className="w-44"
              />
            )}
          </div>
        }
      />
      {state.loading && !state.data ? (
        <LoadingBlock />
      ) : state.error ? (
        <div className="p-5">
          <Alert onRetry={state.reload}>{state.error}</Alert>
        </div>
      ) : (
        <>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(i) => i.id} empty={<EmptyState title="No imports yet" description="Upload a document above and it will appear here for review." />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </>
      )}
    </Card>
  );
}
