"use client";

import React, { useState } from "react";
import type { Coupon, CouponPayload, CouponType } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatNumber, formatSar, toDateTimeLocal } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Select, StatTile, Table, Textarea, Toggle, type Column } from "@/components/ui";

interface CouponForm {
  code: string;
  type: CouponType;
  value: string;
  description: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  active: boolean;
}

const emptyForm: CouponForm = { code: "", type: "PERCENT", value: "", description: "", minOrder: "", maxDiscount: "", startsAt: "", endsAt: "", usageLimit: "", active: true };

function optionalNumber(v: string): number | null | undefined {
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function localToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeCode(v: string): string {
  return v.toUpperCase().replace(/\s+/g, "");
}

function isExpired(c: Coupon, now: number): boolean {
  return !!c.endsAt && new Date(c.endsAt).getTime() < now;
}
function isScheduled(c: Coupon, now: number): boolean {
  return !!c.startsAt && new Date(c.startsAt).getTime() > now;
}

export default function AdminCouponsPage() {
  const { t, lang } = useI18n();
  const state = useAsync(() => api.adminCoupons(), []);
  const [flash, setFlash] = useFlash();

  const [modal, setModal] = useState<{ open: boolean; editing: Coupon | null }>({ open: false, editing: null });
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setForm(emptyForm);
    setErrors({});
    setModal({ open: true, editing: null });
  };
  const openEdit = (c: Coupon) => {
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      description: c.description ?? "",
      minOrder: c.minOrder === null || c.minOrder === undefined ? "" : String(c.minOrder),
      maxDiscount: c.maxDiscount === null || c.maxDiscount === undefined ? "" : String(c.maxDiscount),
      startsAt: toDateTimeLocal(c.startsAt),
      endsAt: toDateTimeLocal(c.endsAt),
      usageLimit: c.usageLimit === null || c.usageLimit === undefined ? "" : String(c.usageLimit),
      active: c.active,
    });
    setErrors({});
    setModal({ open: true, editing: c });
  };
  const closeModal = () => setModal({ open: false, editing: null });

  const save = async () => {
    const next: Record<string, string> = {};
    const code = normalizeCode(form.code);
    if (!code) next.code = "Code is required.";
    else if (!/^[A-Z0-9_-]+$/.test(code)) next.code = "Use letters, numbers, dashes or underscores only.";
    const value = Number(form.value);
    if (form.value.trim() === "" || !Number.isFinite(value) || value <= 0) next.value = "Enter a positive value.";
    else if (form.type === "PERCENT" && value > 100) next.value = "Percent discount cannot exceed 100.";
    const minOrder = optionalNumber(form.minOrder);
    const maxDiscount = form.type === "PERCENT" ? optionalNumber(form.maxDiscount) : null;
    const usageLimit = optionalNumber(form.usageLimit);
    if (minOrder === undefined || (minOrder !== null && minOrder < 0)) next.minOrder = "Enter a minimum order amount (or leave blank).";
    if (maxDiscount === undefined || (maxDiscount !== null && maxDiscount <= 0)) next.maxDiscount = "Enter a maximum discount (or leave blank).";
    if (usageLimit === undefined || (usageLimit !== null && (usageLimit < 1 || !Number.isInteger(usageLimit)))) next.usageLimit = "Enter a whole number of uses (or leave blank).";
    const startsAt = localToIso(form.startsAt);
    const endsAt = localToIso(form.endsAt);
    if (form.startsAt && !startsAt) next.startsAt = "Invalid date.";
    if (form.endsAt && !endsAt) next.endsAt = "Invalid date.";
    if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) next.endsAt = "End must be after start.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload: CouponPayload = {
      code,
      type: form.type,
      value,
      description: form.description.trim() || null,
      minOrder: minOrder ?? null,
      maxDiscount: maxDiscount ?? null,
      startsAt,
      endsAt,
      usageLimit: usageLimit ?? null,
      active: form.active,
    };
    setSaving(true);
    try {
      if (modal.editing) await api.adminUpdateCoupon(modal.editing.id, payload);
      else await api.adminCreateCoupon(payload);
      setFlash({ kind: "success", message: modal.editing ? `Coupon ${code} updated.` : `Coupon ${code} created.` });
      closeModal();
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Coupon, active: boolean) => {
    setToggling(c.id);
    try {
      const updated = await api.adminUpdateCoupon(c.id, { active });
      state.setData((prev) => (prev ? prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)) : prev));
      setFlash({ kind: "success", message: `Coupon ${c.code} ${active ? "activated" : "deactivated"}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setToggling(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.adminDeleteCoupon(deleteTarget.id);
      setFlash({ kind: "success", message: `Coupon ${deleteTarget.code} deleted.` });
      setDeleteTarget(null);
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const now = Date.now();
  const rows = state.data ?? [];
  const activeCount = rows.filter((c) => c.active && !isExpired(c, now)).length;
  const inactiveCount = rows.length - activeCount;
  const totalOrders = rows.reduce((s, c) => s + (c.orders ?? 0), 0);
  const totalDiscount = rows.reduce((s, c) => s + (c.discountGiven ?? 0), 0);

  const columns: Column<Coupon>[] = [
    { key: "code", header: "Code", render: (c) => (
      <div>
        <span className="font-mono text-sm font-bold text-slate-900" dir="ltr">{c.code}</span>
        {c.description && <p className="max-w-[220px] truncate text-xs text-slate-500" title={c.description}>{c.description}</p>}
      </div>
    ) },
    { key: "type", header: "Discount", render: (c) => (
      <span className="inline-flex items-center gap-2">
        <Badge tone={c.type === "PERCENT" ? "blue" : "purple"}>{c.type === "PERCENT" ? "Percent" : "Fixed"}</Badge>
        <span className="font-semibold tabular-nums">{c.type === "PERCENT" ? `${c.value}%` : formatSar(c.value, lang)}</span>
      </span>
    ) },
    { key: "constraints", header: "Constraints", render: (c) => (
      <div className="text-xs text-slate-600">
        <p>Min order: <span className="tabular-nums">{c.minOrder ? formatSar(c.minOrder, lang) : "—"}</span></p>
        {c.type === "PERCENT" && <p>Max discount: <span className="tabular-nums">{c.maxDiscount ? formatSar(c.maxDiscount, lang) : "—"}</span></p>}
      </div>
    ) },
    { key: "validity", header: "Validity", render: (c) => {
      const expired = isExpired(c, now);
      const scheduled = isScheduled(c, now);
      return (
        <div className="text-xs text-slate-600">
          <p className="whitespace-nowrap">{c.startsAt || c.endsAt ? `${c.startsAt ? formatDate(c.startsAt, lang) : "Now"} – ${c.endsAt ? formatDate(c.endsAt, lang) : "No expiry"}` : "No expiry"}</p>
          {expired && <Badge tone="red" className="mt-1">Expired</Badge>}
          {!expired && scheduled && <Badge tone="blue" className="mt-1">Scheduled</Badge>}
        </div>
      );
    } },
    { key: "usage", header: "Usage", render: (c) => {
      const pct = c.usageLimit ? Math.min(100, Math.round((c.usedCount / c.usageLimit) * 100)) : 0;
      return (
        <div className="min-w-[110px]">
          <p className="text-xs tabular-nums text-slate-700">{formatNumber(c.usedCount, lang)} / {c.usageLimit ? formatNumber(c.usageLimit, lang) : "∞"}</p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : "bg-brand-600"}`} style={{ width: c.usageLimit ? `${pct}%` : "0%" }} />
          </div>
        </div>
      );
    } },
    { key: "orders", header: "Orders", align: "end", render: (c) => <span className="tabular-nums">{formatNumber(c.orders ?? 0, lang)}</span> },
    { key: "discount", header: "Discount given", align: "end", render: (c) => <span className="font-medium tabular-nums">{formatSar(c.discountGiven ?? 0, lang)}</span> },
    { key: "status", header: t("common.status"), render: (c) => (
      <span className="inline-flex items-center gap-2">
        <Toggle checked={c.active} onChange={(v) => toggleActive(c, v)} disabled={toggling === c.id} label={`Coupon ${c.code} active`} />
        <span className={`text-xs ${c.active ? "text-emerald-700" : "text-slate-500"}`}>{c.active ? "Active" : "Inactive"}</span>
      </span>
    ) },
    { key: "actions", header: "", align: "end", render: (c) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(c)}>{t("common.delete")}</Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t("admin.coupons")}
        subtitle="Buyers enter the code at checkout. The discount is split across the per-supplier orders pro rata, and VAT is charged on the discounted subtotal."
        action={<Button variant="accent" onClick={openCreate}>+ New coupon</Button>}
      />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Active coupons" value={formatNumber(activeCount, lang)} tone="brand" sub={`${formatNumber(rows.length, lang)} total`} />
            <StatTile label="Orders using coupons" value={formatNumber(totalOrders, lang)} />
            <StatTile label="Total discount given" value={formatSar(totalDiscount, lang)} />
            <StatTile label="Expired / inactive" value={formatNumber(inactiveCount, lang)} tone={inactiveCount > 0 ? "amber" : "default"} />
          </div>
          <Card>
            <Table
              columns={columns}
              rows={rows}
              rowKey={(c) => c.id}
              empty={<EmptyState title="No coupons yet" description="Create a code buyers can enter at checkout to get a percent or fixed discount." action={<Button onClick={openCreate}>Create coupon</Button>} />}
            />
          </Card>
        </>
      )}

      <Modal
        open={modal.open}
        wide
        title={modal.editing ? `Edit ${modal.editing.code}` : "New coupon"}
        onClose={closeModal}
        footer={<><Button variant="outline" onClick={closeModal}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{t("common.save")}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Code" name="code" value={form.code} onChange={(e) => setForm({ ...form, code: normalizeCode(e.target.value) })} error={errors.code} required dir="ltr" placeholder="e.g. WELCOME10" hint="Uppercase, no spaces." className="font-mono" />
          <Select label="Type" name="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CouponType, maxDiscount: e.target.value === "PERCENT" ? form.maxDiscount : "" })} options={[{ value: "PERCENT", label: "Percent off" }, { value: "FIXED", label: "Fixed amount (SAR)" }]} required />
          <Input label={form.type === "PERCENT" ? "Value (%)" : "Value (SAR)"} name="value" type="number" min={0} max={form.type === "PERCENT" ? 100 : undefined} step="0.01" dir="ltr" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} error={errors.value} required />
          <Input label="Minimum order (SAR)" name="minOrder" type="number" min={0} step="0.01" dir="ltr" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} error={errors.minOrder} hint="Subtotal before VAT. Leave blank for none." />
          {form.type === "PERCENT" && (
            <Input label="Maximum discount (SAR)" name="maxDiscount" type="number" min={0} step="0.01" dir="ltr" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} error={errors.maxDiscount} hint="Caps the percent discount. Leave blank for no cap." />
          )}
          <Input label="Usage limit" name="usageLimit" type="number" min={1} step="1" dir="ltr" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} error={errors.usageLimit} hint="Total redemptions across all buyers. Leave blank for unlimited." />
          <Input label="Starts at" name="startsAt" type="datetime-local" dir="ltr" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} error={errors.startsAt} hint="Leave blank to start immediately." />
          <Input label="Ends at" name="endsAt" type="datetime-local" dir="ltr" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} error={errors.endsAt} hint="Leave blank for no expiry." />
          <Textarea label="Description" name="description" className="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Shown to buyers when the code is applied." />
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
            <span>
              <span className="block text-sm font-medium text-slate-700">Active</span>
              <span className="block text-xs text-slate-500">Inactive coupons are rejected at checkout even within their validity window.</span>
            </span>
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Coupon active" />
          </label>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Delete coupon"
        onClose={() => setDeleteTarget(null)}
        footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={remove} loading={deleting}>{t("common.delete")}</Button></>}
      >
        {deleteTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Delete coupon <span className="font-mono font-semibold text-slate-900">{deleteTarget.code}</span>? Buyers will no longer be able to apply it.</p>
            {(deleteTarget.orders ?? 0) > 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">This code has been used on {formatNumber(deleteTarget.orders ?? 0, lang)} order{(deleteTarget.orders ?? 0) === 1 ? "" : "s"}. Existing orders keep their discount; consider deactivating instead to preserve the history.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
