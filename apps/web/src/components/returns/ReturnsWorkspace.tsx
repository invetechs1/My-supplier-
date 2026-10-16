"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import type { ReturnItem, ReturnRequest, ReturnStatus } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { RETURN_TRANSITIONS, supplierCommerceApi, type ReturnActionPayload, type ReturnActionStatus } from "@/lib/api/supplierCommerce";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn, formatDateTime, formatNumber, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Pagination, Select, StatTile, StatusBadge, Table, Textarea, type Column } from "@/components/ui";

type Tone = "green" | "amber" | "red" | "blue" | "slate" | "purple";

export const RETURN_STATUS_LABEL_KEY: Record<ReturnStatus, TranslationKey> = {
  REQUESTED: "returns.stRequested",
  APPROVED: "returns.stApproved",
  RECEIVED: "returns.stReceived",
  REFUNDED: "returns.stRefunded",
  REJECTED: "returns.stRejected",
  CANCELLED: "returns.stCancelled",
};
const PAYMENT_METHOD_KEY: Record<string, TranslationKey> = { COD: "checkout.cod", BANK_TRANSFER: "checkout.bank", CARD: "checkout.card", CREDIT: "checkout.credit" };
const RETURN_STATUS_TONE: Record<ReturnStatus, Tone> = {
  REQUESTED: "amber",
  APPROVED: "blue",
  RECEIVED: "purple",
  REFUNDED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};
const REASON_LABEL_KEY: Record<string, TranslationKey> = {
  DAMAGED: "returns.rsDamaged",
  DEFECTIVE: "returns.rsDefective",
  WRONG_ITEM: "returns.rsWrongItem",
  NOT_AS_DESCRIBED: "returns.rsNotAsDescribed",
  EXCESS: "returns.rsExcess",
  OTHER: "returns.rsOther",
};
const TILE_SUB_KEY: Record<ReturnStatus, TranslationKey> = {
  REQUESTED: "returns.awaitingDecision",
  APPROVED: "returns.goodsOnWay",
  RECEIVED: "returns.refundToRecord",
  REFUNDED: "returns.closed",
  REJECTED: "returns.closed",
  CANCELLED: "returns.closed",
};
const ACTION_META: Record<ReturnActionStatus, { labelKey: TranslationKey; variant: "primary" | "danger" | "accent" | "secondary"; confirmKey?: TranslationKey; successKey: TranslationKey }> = {
  APPROVED: { labelKey: "returns.approve", variant: "primary", successKey: "returns.approveSuccess" },
  REJECTED: { labelKey: "returns.reject", variant: "danger", confirmKey: "returns.rejectConfirm", successKey: "returns.rejectSuccess" },
  RECEIVED: { labelKey: "returns.markReceived", variant: "primary", successKey: "returns.receivedSuccess" },
  REFUNDED: { labelKey: "returns.markRefunded", variant: "accent", confirmKey: "returns.refundConfirm", successKey: "returns.refundSuccess" },
};
const TILE_STATUSES: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED"];
const STATUS_VALUES = Object.keys(RETURN_STATUS_LABEL_KEY) as ReturnStatus[];

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  const { t } = useI18n();
  return <Badge tone={RETURN_STATUS_TONE[status] ?? "slate"}>{RETURN_STATUS_LABEL_KEY[status] ? t(RETURN_STATUS_LABEL_KEY[status]) : status}</Badge>;
}

const itemsTotal = (items: ReturnItem[]) => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

/**
 * Shared returns (RMA) workspace: list + detail with the status actions a supplier or admin may take.
 * `mode` only changes the copy, the order links and whether the supplier column is shown.
 */
export function ReturnsWorkspace({ mode, initialId }: { mode: "supplier" | "admin"; initialId?: string | null }) {
  const { t, lang } = useI18n();
  const isAdmin = mode === "admin";
  const statusLabel = (s: ReturnStatus) => t(RETURN_STATUS_LABEL_KEY[s]);
  const reasonLabel = (reason: string) => (REASON_LABEL_KEY[reason] ? t(REASON_LABEL_KEY[reason]) : reason);
  const statusOptions = STATUS_VALUES.map((s) => ({ value: s, label: statusLabel(s) }));
  const [status, setStatus] = useState<ReturnStatus | "">("");
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useFlash(6000);
  const [statsTick, setStatsTick] = useState(0);

  const list = useAsync(() => supplierCommerceApi.returns({ status, page }), [status, page]);
  const stats = useAsync(async () => {
    const res = await Promise.all(TILE_STATUSES.map((s) => supplierCommerceApi.returns({ status: s, pageSize: 1 })));
    return Object.fromEntries(TILE_STATUSES.map((s, i) => [s, res[i].total])) as Record<ReturnStatus, number>;
  }, [statsTick]);

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);

  // Keep the selection valid when the page changes; a deep-linked return stays selected even when it is not on this page.
  useEffect(() => {
    if (selectedId && (selectedId === initialId || rows.some((r) => r.id === selectedId))) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId, initialId]);

  const detail = useAsync(() => (selectedId ? supplierCommerceApi.returnDetail(selectedId) : Promise.resolve(null)), [selectedId]);
  const ret = detail.data;

  const [resolution, setResolution] = useState("");
  const [refund, setRefund] = useState("");
  const [acting, setActing] = useState<ReturnActionStatus | null>(null);
  useEffect(() => {
    if (!ret) return;
    setResolution(ret.resolution ?? "");
    const amount = ret.refundAmount ?? ret.estimatedRefund;
    setRefund(amount === null || amount === undefined ? "" : String(amount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ret?.id, ret?.status]);

  const pickStatus = (next: ReturnStatus | "") => {
    setStatus(next);
    setPage(1);
  };

  const act = async (next: ReturnActionStatus) => {
    if (!ret) return;
    const meta = ACTION_META[next];
    if (meta.confirmKey && !window.confirm(t(meta.confirmKey))) return;
    const body: ReturnActionPayload = { status: next };
    if (resolution.trim()) body.resolution = resolution.trim();
    if (next === "RECEIVED" || next === "REFUNDED") {
      if (refund.trim() !== "") {
        const n = Number(refund);
        if (!Number.isFinite(n) || n < 0) {
          setFlash({ kind: "error", message: t("returns.errRefundAmount") });
          return;
        }
        const cap = ret.refundAmount ?? ret.estimatedRefund;
        if (cap !== null && cap !== undefined && n > cap + 0.01) {
          setFlash({ kind: "error", message: `${t("returns.refundCannotExceed")} ${formatSar(cap, lang)}.` });
          return;
        }
        body.refundAmount = n;
      }
    }
    setActing(next);
    try {
      const updated = await supplierCommerceApi.updateReturn(ret.id, body);
      detail.setData((prev) => (prev ? { ...prev, ...updated, estimatedRefund: prev.estimatedRefund } : updated));
      list.setData((prev) => (prev ? { ...prev, data: prev.data.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)) } : prev));
      setStatsTick((n) => n + 1);
      setFlash({ kind: "success", message: t(meta.successKey) });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setActing(null);
    }
  };

  const orderHref = (orderId: string) => (isAdmin ? `/admin/orders/${orderId}` : `/supplier/orders/${orderId}`);
  const transitions = ret ? RETURN_TRANSITIONS[ret.status] ?? [] : [];
  const needsRefundInput = transitions.includes("RECEIVED") || transitions.includes("REFUNDED");

  const itemColumns: Column<ReturnItem>[] = [
    { key: "name", header: t("orders.item"), render: (i) => <span className="font-medium text-slate-900">{i.name}</span> },
    { key: "qty", header: t("orders.qty"), align: "end", render: (i) => <span className="tabular-nums">{formatNumber(i.quantity, lang)} {i.unit}</span> },
    { key: "unit", header: t("product.unitPrice"), align: "end", render: (i) => <span className="tabular-nums">{formatSar(i.unitPrice, lang)}</span> },
    { key: "total", header: t("product.lineTotal"), align: "end", render: (i) => <span className="font-semibold tabular-nums">{formatSar(i.quantity * i.unitPrice, lang)}</span> },
  ];

  const tile = (s: ReturnStatus) => {
    const selected = status === s;
    const value = stats.data ? formatNumber(stats.data[s], lang) : "…";
    return (
      <button key={s} type="button" onClick={() => pickStatus(selected ? "" : s)} aria-pressed={selected} className={cn("rounded-xl text-start transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2", selected ? "ring-2 ring-brand-600 ring-offset-2" : "hover:-translate-y-0.5")} title={`${t("returns.showReturns")}: ${statusLabel(s)}`}>
        <StatTile label={statusLabel(s)} value={value} tone={s === "REQUESTED" && (stats.data?.REQUESTED ?? 0) > 0 ? "amber" : "default"} sub={t(TILE_SUB_KEY[s])} className="h-full" />
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title={t(isAdmin ? "admin.returns" : "sup.returns")}
        subtitle={isAdmin ? t("returns.adminSubtitle") : t("returns.supplierSubtitle")}
        action={<Select name="status" aria-label={t("common.status")} value={status} onChange={(e) => pickStatus(e.target.value as ReturnStatus | "")} placeholder={t("orders.allStatuses")} options={statusOptions} />}
      />
      <FlashMessage flash={flash} className="mb-4" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{TILE_STATUSES.map(tile)}</div>

      {list.loading && !list.data ? <LoadingBlock /> : list.error ? <Alert onRetry={list.reload}>{list.error}</Alert> : rows.length === 0 && !initialId ? (
        <Card>
          <EmptyState title={t("returns.none")} description={status ? `${t("returns.noneWithStatus")}: ${statusLabel(status)}.` : isAdmin ? t("returns.adminEmptyDesc") : t("returns.supplierEmptyDesc")} action={status ? <Button variant="outline" onClick={() => pickStatus("")}>{t("returns.showAll")}</Button> : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState title={t("returns.noneOnPage")} />
            ) : (
              <ul className={cn("divide-y divide-slate-100", list.loading && "opacity-60")} aria-busy={list.loading}>
                {rows.map((r: ReturnRequest) => {
                  const active = r.id === selectedId;
                  const open = r.status === "REQUESTED";
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => setSelectedId(r.id)} aria-current={active ? "true" : undefined} className={cn("block w-full px-4 py-3 text-start transition hover:bg-slate-50 focus:outline-none focus-visible:bg-brand-50", active && "border-s-2 border-brand-600 bg-brand-50/60", open && !active && "bg-amber-50/30")}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900" dir="ltr">{r.reference}</span>
                          <span className="shrink-0 text-xs text-slate-500" title={formatDateTime(r.createdAt, lang)}>{timeAgo(r.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-700">
                          {r.buyer?.name ?? t("reviews.buyer")}
                          {isAdmin && r.company?.name ? <span className="text-slate-500"> · {r.company.name}</span> : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {r.items.length} {r.items.length === 1 ? t("cart.itemOne") : t("cart.itemMany")} · {reasonLabel(r.reason)}
                          {r.order ? <span dir="ltr"> · {r.order.reference}</span> : null}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <ReturnStatusBadge status={r.status} />
                          {r.refundAmount !== null && r.refundAmount !== undefined && <span className="text-xs font-semibold tabular-nums text-slate-700">{formatSar(r.refundAmount, lang)}</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
          </Card>

          {!selectedId ? (
            <Card><EmptyState title={t("returns.selectReturn")} description={t("returns.selectReturnDesc")} /></Card>
          ) : detail.loading && !ret ? (
            <Card><LoadingBlock /></Card>
          ) : detail.error ? (
            <Alert onRetry={detail.reload}>{detail.error}</Alert>
          ) : ret ? (
            <Card>
              <CardHeader
                title={<span className="font-mono" dir="ltr">{ret.reference}</span>}
                subtitle={<>{t("returns.requestedAt")} {formatDateTime(ret.createdAt, lang)}{ret.updatedAt !== ret.createdAt ? ` · ${t("orders.updated")} ${formatDateTime(ret.updatedAt, lang)}` : ""}</>}
                action={<ReturnStatusBadge status={ret.status} />}
              />
              <CardBody className="space-y-5">
                <dl className="grid gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{t("reviews.buyer")}</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">
                      {ret.buyer?.name ?? "—"}
                      {ret.buyer?.email && <p className="text-xs font-normal text-slate-500" dir="ltr"><a href={`mailto:${ret.buyer.email}`} className="hover:underline">{ret.buyer.email}</a></p>}
                    </dd>
                  </div>
                  {isAdmin && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">{t("product.supplier")}</dt>
                      <dd className="mt-0.5 font-medium text-slate-900">{ret.company ? <Link href={`/admin/companies/${ret.company.id}`} className="text-brand-700 hover:underline">{ret.company.name}</Link> : "—"}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{t("returns.order")}</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                      <Link href={orderHref(ret.orderId)} className="font-mono text-sm font-medium text-brand-700 hover:underline" dir="ltr">{ret.order?.reference ?? ret.orderId}</Link>
                      {ret.order && <StatusBadge status={ret.order.paymentStatus} />}
                      {ret.order && <span className="text-xs text-slate-500">{t("returns.totalLower")} {formatSar(ret.order.total, lang)}{ret.order.paymentMethod ? ` · ${PAYMENT_METHOD_KEY[ret.order.paymentMethod] ? t(PAYMENT_METHOD_KEY[ret.order.paymentMethod]) : ret.order.paymentMethod.replace(/_/g, " ")}` : ""}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{t("returns.reason")}</dt>
                    <dd className="mt-0.5 font-medium text-slate-900">{reasonLabel(ret.reason)}</dd>
                  </div>
                </dl>

                {ret.details && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("returns.buyerNotes")}</h4>
                    <p className="whitespace-pre-wrap rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed text-slate-800">{ret.details}</p>
                  </div>
                )}
                {ret.images.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("returns.photos")}</h4>
                    <div className="flex flex-wrap gap-2">
                      {ret.images.map((src, i) => (
                        <a key={`${src}-${i}`} href={src} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`${t("returns.photo")} ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("orders.items")}</h4>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <Table columns={itemColumns} rows={ret.items} rowKey={(i) => i.orderItemId} dense empty={<EmptyState title={t("returns.noItems")} />} />
                  </div>
                </div>

                <dl className="grid gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">{t("returns.goodsValue")}</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatSar(itemsTotal(ret.items), lang)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">{t("returns.estimatedRefund")}</dt>
                    <dd className="font-semibold tabular-nums text-slate-900" title={t("returns.estimatedRefundHint")}>{ret.estimatedRefund === null || ret.estimatedRefund === undefined ? "—" : formatSar(ret.estimatedRefund, lang)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">{ret.status === "REFUNDED" ? t("checkout.refunded") : t("returns.refundSet")}</dt>
                    <dd className={cn("font-semibold tabular-nums", ret.status === "REFUNDED" ? "text-emerald-700" : "text-slate-900")}>{ret.refundAmount === null || ret.refundAmount === undefined ? "—" : formatSar(ret.refundAmount, lang)}</dd>
                  </div>
                </dl>

                {transitions.length > 0 ? (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <Textarea label={t("returns.resolutionNote")} name="resolution" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={ret.status === "REQUESTED" ? t("returns.resolutionPlaceholderRequested") : t("returns.resolutionPlaceholderOther")} hint={t("returns.resolutionHint")} />
                    {needsRefundInput && (
                      <Input label={t("returns.refundAmountSar")} name="refundAmount" type="number" min={0} step="0.01" dir="ltr" value={refund} onChange={(e) => setRefund(e.target.value)} hint={`${t("returns.prefilledWith")} ${ret.refundAmount !== null && ret.refundAmount !== undefined ? t("returns.amountAtReceipt") : t("returns.estimatedRefundLower")}${t("returns.semicolon")} ${t("returns.mayLower")}`} className="max-w-xs" />
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {transitions.map((next) => (
                        <Button key={next} variant={ACTION_META[next].variant} onClick={() => act(next)} loading={acting === next} disabled={acting !== null && acting !== next}>{t(ACTION_META[next].labelKey)}</Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p>{t("returns.thisReturnIs")} <span className="font-medium text-slate-900">{statusLabel(ret.status).toLowerCase()}</span>{t("returns.noFurtherAction")}</p>
                    {ret.resolution && <p className="mt-1 whitespace-pre-wrap text-slate-700"><span className="text-xs uppercase tracking-wide text-slate-500">{t("returns.resolution")}</span> {ret.resolution}</p>}
                  </div>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card><EmptyState title={t("returns.notFound")} description={t("returns.notFoundDesc")} /></Card>
          )}
        </div>
      )}
    </div>
  );
}
