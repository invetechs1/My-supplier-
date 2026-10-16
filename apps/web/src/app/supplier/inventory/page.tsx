"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import type { InventoryItem, StockMovement } from "@mysupplier/shared";
import { api, errorMessage, inventoryExportPath, openDownload, type StockMovementPayload } from "@/lib/api";
import { useAsync, useDebounce, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn, formatDateTime, formatNumber, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LinkButton, LoadingBlock, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from "@/components/ui";
import { RoleGuard } from "@/components/RoleGuard";

const MOVEMENT_TONE: Record<StockMovement["type"], "green" | "red" | "blue" | "amber" | "slate"> = { IN: "green", OUT: "red", ADJUST: "blue", RESERVE: "amber", RELEASE: "slate" };
const MOVEMENT_LABEL_KEY: Record<StockMovement["type"], TranslationKey> = { IN: "sup.inventory.mvIn", OUT: "sup.inventory.mvOut", ADJUST: "sup.inventory.mvAdjust", RESERVE: "sup.inventory.mvReserve", RELEASE: "sup.inventory.mvRelease" };

function MovementHistory({ listingId, refreshKey }: { listingId: string; refreshKey: number }) {
  const { t } = useI18n();
  const state = useAsync(() => api.stockMovements(listingId), [listingId, refreshKey]);
  if (state.loading) return <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500"><Spinner size="sm" /> {t("sup.inventory.loadingMovements")}</div>;
  if (state.error) return <div className="px-4 py-3"><Alert onRetry={state.reload}>{state.error}</Alert></div>;
  const rows = state.data ?? [];
  if (rows.length === 0) return <p className="px-4 py-3 text-sm text-slate-500">{t("sup.inventory.noMovements")}</p>;
  return (
    <table className="min-w-full text-xs">
      <thead className="text-slate-500">
        <tr>
          <th className="px-4 py-2 text-start font-semibold uppercase tracking-wide">{t("sup.inventory.when")}</th>
          <th className="px-4 py-2 text-start font-semibold uppercase tracking-wide">{t("sup.inventory.type")}</th>
          <th className="px-4 py-2 text-end font-semibold uppercase tracking-wide">{t("orders.qty")}</th>
          <th className="px-4 py-2 text-end font-semibold uppercase tracking-wide">{t("sup.inventory.balance")}</th>
          <th className="px-4 py-2 text-start font-semibold uppercase tracking-wide">{t("sup.inventory.reasonOrder")}</th>
          <th className="px-4 py-2 text-start font-semibold uppercase tracking-wide">{t("sup.inventory.by")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="px-4 py-2 text-slate-500">{formatDateTime(m.createdAt)}</td>
            <td className="px-4 py-2"><Badge tone={MOVEMENT_TONE[m.type] ?? "slate"}>{MOVEMENT_LABEL_KEY[m.type] ? t(MOVEMENT_LABEL_KEY[m.type]) : m.type}</Badge></td>
            <td className={cn("px-4 py-2 text-end tabular-nums font-semibold", m.type === "OUT" || m.type === "RESERVE" ? "text-red-700" : "text-emerald-700")}>{m.type === "OUT" || m.type === "RESERVE" ? "−" : "+"}{formatNumber(Math.abs(m.quantity))}</td>
            <td className="px-4 py-2 text-end tabular-nums">{m.balanceAfter ?? "—"}</td>
            <td className="px-4 py-2 text-slate-600">
              {m.order ? <Link href={`/supplier/orders/${m.order.id}`} className="font-medium text-brand-700 hover:underline">{m.order.reference}</Link> : null}
              {m.order && m.reason ? " · " : ""}
              {m.reason}
            </td>
            <td className="px-4 py-2 text-slate-500">{m.user?.name ?? t("sup.inventory.system")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InventoryInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 300);
  const [branchId, setBranchId] = useState("");
  const [lowOnly, setLowOnly] = useState(params.get("lowStock") === "1");
  const [page, setPage] = useState(1);
  const branches = useAsync(() => api.branches(), []);
  const state = useAsync(() => api.inventory({ q: dq || undefined, branchId: branchId || undefined, lowStock: lowOnly ? 1 : undefined, page }), [dq, branchId, lowOnly, page]);
  const [flash, setFlash] = useFlash(6000);

  const [inline, setInline] = useState<{ id: string; stock: string } | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, number>>({});
  const [adjust, setAdjust] = useState<InventoryItem | null>(null);
  const [adjustForm, setAdjustForm] = useState<{ type: StockMovementPayload["type"]; quantity: string; reason: string }>({ type: "IN", quantity: "", reason: "" });
  const [adjusting, setAdjusting] = useState(false);

  const replaceRow = (updated: InventoryItem) =>
    state.setData((prev) => (prev ? { ...prev, data: prev.data.map((r) => (r.listing.id === updated.listing.id ? { ...r, ...updated } : r)) } : prev));

  const saveInline = async () => {
    if (!inline) return;
    const stock = inline.stock.trim() === "" ? null : Math.max(0, Math.floor(Number(inline.stock)));
    if (stock !== null && Number.isNaN(stock)) {
      setFlash({ kind: "error", message: t("sup.inventory.errWholeNumberBlank") });
      return;
    }
    setInlineSaving(true);
    try {
      const updated = await api.setStock(inline.id, { stock });
      replaceRow(updated);
      setInline(null);
      setExpanded((e) => (e[inline.id] !== undefined ? { ...e, [inline.id]: e[inline.id] + 1 } : e));
      setFlash({ kind: "success", message: stock === null ? t("sup.inventory.trackingStopped") : t("sup.inventory.stockUpdated") });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setInlineSaving(false);
    }
  };

  const startTracking = async (row: InventoryItem) => {
    const input = window.prompt(`${t("sup.inventory.promptCurrentStock")} ${row.listing.material.name} (${row.listing.material.unit}) ${t("sup.inventory.promptIn")} ${row.listing.city}:`, "0");
    if (input === null) return;
    const stock = Math.max(0, Math.floor(Number(input)));
    if (Number.isNaN(stock)) {
      setFlash({ kind: "error", message: t("sup.inventory.errWholeNumber") });
      return;
    }
    try {
      replaceRow(await api.setStock(row.listing.id, { stock }));
      setFlash({ kind: "success", message: t("sup.inventory.trackingStarted") });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    }
  };

  const submitAdjust = async () => {
    if (!adjust) return;
    const qty = Number(adjustForm.quantity);
    if (!adjustForm.quantity || Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setFlash({ kind: "error", message: t("sup.inventory.errPositiveWhole") });
      return;
    }
    setAdjusting(true);
    try {
      const movement = await api.addStockMovement(adjust.listing.id, { type: adjustForm.type, quantity: qty, reason: adjustForm.reason.trim() || undefined });
      const prevStock = adjust.stock ?? 0;
      const nextStock = movement.balanceAfter ?? (adjustForm.type === "IN" ? prevStock + qty : adjustForm.type === "OUT" ? Math.max(0, prevStock - qty) : qty);
      replaceRow({ ...adjust, stock: nextStock, available: Math.max(0, nextStock - adjust.reserved) });
      setExpanded((e) => (e[adjust.listing.id] !== undefined ? { ...e, [adjust.listing.id]: e[adjust.listing.id] + 1 } : e));
      setAdjust(null);
      setFlash({ kind: "success", message: `${t("sup.inventory.movementRecorded")} (${t(MOVEMENT_LABEL_KEY[adjustForm.type])} ${qty}).` });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setAdjusting(false);
    }
  };

  const toggleExpanded = (id: string) =>
    setExpanded((e) => {
      const next = { ...e };
      if (next[id] !== undefined) delete next[id];
      else next[id] = 0;
      return next;
    });

  const rows = state.data?.data ?? [];
  const lowCount = rows.filter((r) => r.lowStock).length;

  return (
    <div>
      <PageHeader
        title={t("sup.inventory")}
        subtitle={t("sup.inventory.subtitle")}
        action={
          <>
            <LinkButton href="/supplier/imports" variant="outline">{t("sup.inventory.importFrom")}</LinkButton>
            <button type="button" onClick={() => void openDownload(inventoryExportPath())} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("sup.inventory.exportCsv")}
            </button>
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input name="q" placeholder={t("sup.inventory.searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="sm:col-span-2" aria-label={t("sup.inventory.searchAria")} />
          <Select name="branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }} placeholder={t("sup.inventory.allBranches")} options={(branches.data ?? []).map((b) => ({ value: b.id, label: `${b.name} · ${b.city}` }))} />
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
            <input type="checkbox" checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); setPage(1); }} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            {t("sup.inventory.lowStockOnly")}
          </label>
        </div>
      </Card>

      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          {lowCount > 0 && <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">{lowCount} {lowCount === 1 ? t("sup.inventory.lowBannerOne") : t("sup.inventory.lowBannerMany")} <Link href="/supplier/company" className="font-semibold underline">{t("sup.inventory.changeThreshold")}</Link></div>}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">{t("sup.inventory.product")}</th>
                  <th className="px-4 py-3 text-start">{t("sup.inventory.branchCity")}</th>
                  <th className="px-4 py-3 text-end">{t("product.price")}</th>
                  <th className="px-4 py-3 text-end">{t("product.stock")}</th>
                  <th className="px-4 py-3 text-end">{t("sup.inventory.reserved")}</th>
                  <th className="px-4 py-3 text-end">{t("sup.inventory.available")}</th>
                  <th className="px-4 py-3 text-end">{t("sup.inventory.sold30d")}</th>
                  <th className="px-4 py-3 text-start">{t("orders.updated")}</th>
                  <th className="px-4 py-3 text-end"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.length === 0 && (
                  <tr><td colSpan={9}><EmptyState title={t("sup.inventory.noListings")} description={lowOnly ? t("sup.inventory.nothingBelow") : t("sup.inventory.publishToTrack")} action={!lowOnly && <LinkButton href="/supplier/prices" size="sm">{t("sup.inventory.goToPriceList")}</LinkButton>} /></td></tr>
                )}
                {rows.map((r) => {
                  const l = r.listing;
                  const id = l.id;
                  const tracked = r.stock !== null && r.stock !== undefined;
                  const isOpen = expanded[id] !== undefined;
                  return (
                    <React.Fragment key={id}>
                      <tr className={cn(r.lowStock && "bg-amber-50/40")}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900"><Link href={`/shop/products/${l.material.id}`} className="hover:text-brand-700">{lang === "ar" ? l.material.nameAr || l.material.name : l.material.name}</Link></p>
                          <p className="text-xs text-slate-500">{l.material.sku} · {t("shop.per")} {l.material.unit}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {l.branch ? <><span className="font-medium">{l.branch.name}</span><span className="block text-xs text-slate-500">{l.city}</span></> : l.city}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">{formatSar(l.price, lang)}</td>
                        <td className="px-4 py-3 text-end">
                          {inline?.id === id ? (
                            <Input name={`stock-${id}`} type="number" min={0} value={inline.stock} onChange={(e) => setInline({ ...inline, stock: e.target.value })} className="ms-auto w-24" dir="ltr" placeholder="—" aria-label={t("product.stock")} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void saveInline(); if (e.key === "Escape") setInline(null); }} />
                          ) : tracked ? (
                            <button type="button" onClick={() => setInline({ id, stock: String(r.stock ?? "") })} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold tabular-nums hover:bg-slate-100" title={t("sup.inventory.clickToEdit")}>
                              {formatNumber(r.stock)}
                              {r.lowStock && <Badge tone="amber">{t("sup.inventory.low")}</Badge>}
                              {r.stock === 0 && <Badge tone="red">{t("sup.inventory.out")}</Badge>}
                            </button>
                          ) : (
                            <Badge tone="slate">{t("sup.inventory.notTracked")}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums text-slate-600">{tracked ? formatNumber(r.reserved) : "—"}</td>
                        <td className={cn("px-4 py-3 text-end tabular-nums font-semibold", tracked && (r.available ?? 0) <= 0 ? "text-red-700" : "text-slate-900")}>{tracked ? formatNumber(r.available) : "—"}</td>
                        <td className="px-4 py-3 text-end tabular-nums text-slate-600">{formatNumber(r.soldLast30d)}</td>
                        <td className="px-4 py-3 text-slate-500">{timeAgo(l.updatedAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            {inline?.id === id ? (
                              <>
                                <Button size="sm" onClick={saveInline} loading={inlineSaving}>{t("common.save")}</Button>
                                <Button size="sm" variant="ghost" onClick={() => setInline(null)} disabled={inlineSaving}>{t("common.cancel")}</Button>
                              </>
                            ) : tracked ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => { setAdjust(r); setAdjustForm({ type: "IN", quantity: "", reason: "" }); }}>{t("sup.inventory.adjust")}</Button>
                                <Button size="sm" variant="ghost" onClick={() => toggleExpanded(id)} aria-expanded={isOpen}>{isOpen ? t("integrations.hide") : t("sup.inventory.history")}</Button>
                              </>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => startTracking(r)}>{t("sup.inventory.startTracking")}</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="p-0"><MovementHistory listingId={id} refreshKey={expanded[id]} /></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}

      <Modal open={!!adjust} title={adjust ? `${t("sup.inventory.adjustStock")} · ${adjust.listing.material.name}` : ""} onClose={() => setAdjust(null)} footer={<><Button variant="outline" onClick={() => setAdjust(null)}>{t("common.cancel")}</Button><Button onClick={submitAdjust} loading={adjusting}>{t("sup.inventory.recordMovement")}</Button></>}>
        {adjust && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {t("sup.inventory.currentStock")} <span className="font-semibold text-slate-900">{formatNumber(adjust.stock)}</span> · {t("sup.inventory.reservedLower")} {formatNumber(adjust.reserved)} · {t("sup.inventory.availableLower")} <span className="font-semibold">{formatNumber(adjust.available)}</span> {adjust.listing.material.unit}
              {adjust.listing.branch ? ` · ${adjust.listing.branch.name}` : ""}
            </div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("sup.inventory.movementType")}>
              {([["IN", "sup.inventory.optIn", "sup.inventory.optInHint"], ["OUT", "sup.inventory.optOut", "sup.inventory.optOutHint"], ["ADJUST", "sup.inventory.optAdjust", "sup.inventory.optAdjustHint"]] as const).map(([type, labelKey, hintKey]) => (
                <button key={type} type="button" role="radio" aria-checked={adjustForm.type === type} onClick={() => setAdjustForm({ ...adjustForm, type })} className={cn("rounded-xl border p-3 text-start text-sm transition", adjustForm.type === type ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300")}>
                  <span className="block font-semibold text-slate-900">{t(labelKey)}</span>
                  <span className="block text-xs text-slate-500">{t(hintKey)}</span>
                </button>
              ))}
            </div>
            <Input label={adjustForm.type === "ADJUST" ? `${t("sup.inventory.newStockLevel")} (${adjust.listing.material.unit})` : `${t("product.quantity")} (${adjust.listing.material.unit})`} name="adjustQty" type="number" min={adjustForm.type === "ADJUST" ? 0 : 1} step={1} dir="ltr" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} required autoFocus />
            <Textarea label={t("sup.inventory.reasonOptional")} name="adjustReason" rows={2} value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder={t("sup.inventory.reasonPlaceholder")} />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function SupplierInventoryPage() {
  return (
    <RoleGuard area="inventory">
      <Suspense fallback={<LoadingBlock />}>
        <InventoryInner />
      </Suspense>
    </RoleGuard>
  );
}
