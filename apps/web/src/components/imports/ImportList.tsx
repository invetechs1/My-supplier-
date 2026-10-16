"use client";

import Link from "next/link";
import { useState } from "react";
import type { ImportKind, ImportStatus, PriceImport } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, LoadingBlock, Pagination, Select, StatusBadge, Table, type Column } from "@/components/ui";
import { KIND_LABEL_KEY, KIND_TONE, type ImportArea } from "./ImportReview";

const STATUSES: ImportStatus[] = ["REVIEW", "PUBLISHED", "REJECTED", "FAILED", "PROCESSING"];
const KINDS: ImportKind[] = ["SUPPLIER_PRICE_LIST", "BUYER_QUOTATION", "WEB_PAGE", "TEXT"];
const STATUS_LABEL_KEY: Record<ImportStatus, TranslationKey> = {
  REVIEW: "sup.imports.statusReview",
  PUBLISHED: "sup.imports.statusPublished",
  REJECTED: "sup.imports.statusRejected",
  FAILED: "sup.imports.statusFailed",
  PROCESSING: "sup.imports.statusProcessing",
};

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

export function ImportList({ area, fixedKind, refreshKey = 0, title, onTotal }: ImportListProps) {
  const { t, lang } = useI18n();
  const heading = title ?? t("sup.imports.imports");
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
    { key: "date", header: t("common.date"), render: (i) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(i.createdAt, lang)}</span> },
    ...(fixedKind ? [] : [{ key: "kind", header: t("sup.imports.kind"), render: (i: PriceImport) => <Badge tone={KIND_TONE[i.kind] ?? "slate"}>{KIND_LABEL_KEY[i.kind] ? t(KIND_LABEL_KEY[i.kind]) : i.kind}</Badge> } as Column<PriceImport>]),
    {
      key: "source",
      header: t("product.source"),
      render: (i) => (
        <div className="min-w-0">
          <Link href={`${base}/${i.id}`} className="font-medium text-slate-900 hover:text-brand-700">
            {i.sourceName || i.supplierName || i.fileName || t("sup.imports.untitled")}
          </Link>
          <p className="truncate text-xs text-slate-500" dir="ltr">
            {i.fileName ?? (i.kind === "TEXT" ? t("sup.imports.pastedTextSource") : "")}
            {i.city ? ` · ${i.city}` : ""}
          </p>
        </div>
      ),
    },
    { key: "status", header: t("common.status"), render: (i) => <StatusBadge status={i.status} /> },
    {
      key: "counts",
      header: t("sup.imports.extractedPublished"),
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
            header: t("sup.imports.uploadedBy"),
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
          {i.status === "REVIEW" ? t("sup.imports.reviewArrow") : t("sup.imports.openArrow")}
        </Link>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title={heading}
        subtitle={state.data ? `${state.data.total} ${t("sup.imports.totalSuffix")}` : undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <Select
              name="importStatus"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ImportStatus | "");
                setPage(1);
              }}
              placeholder={t("common.allStatuses")}
              options={STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL_KEY[s]) }))}
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
                placeholder={t("sup.imports.allKinds")}
                options={KINDS.map((k) => ({ value: k, label: t(KIND_LABEL_KEY[k]) }))}
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
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(i) => i.id} empty={<EmptyState title={t("sup.imports.emptyTitle")} description={t("sup.imports.emptyDesc")} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </>
      )}
    </Card>
  );
}
