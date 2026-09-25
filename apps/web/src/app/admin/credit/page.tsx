"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import type { CompanyType } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { supplierCommerceApi, type AdminCompanyRow } from "@/lib/api/supplierCommerce";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatNumber, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, StatTile, Table, Toggle, VerifiedBadge, type Column } from "@/components/ui";

/** Buying companies first – credit terms are for the companies that pay on account. */
const TYPE_ORDER: Record<string, number> = { CONTRACTOR: 0, OTHER: 1, CONSULTANT: 2, SUPPLIER: 3 };
const TYPE_LABEL: Record<string, string> = { CONTRACTOR: "Contractor", CONSULTANT: "Consultant", OTHER: "Buyer", SUPPLIER: "Supplier" };
const TYPE_OPTIONS = [
  { value: "BUYERS", label: "Buying companies" },
  { value: "CONTRACTOR", label: "Contractors" },
  { value: "CONSULTANT", label: "Consultants" },
  { value: "OTHER", label: "Other buyers" },
  { value: "SUPPLIER", label: "Suppliers" },
];

const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));

interface CreditForm {
  approved: boolean;
  limit: string;
  termsDays: string;
}

function AdminCreditInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState("");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const state = useAsync(() => supplierCommerceApi.adminCompanies({ q: q || undefined, page, pageSize: 50 }), [q, page]);
  const [flash, setFlash] = useFlash(6000);

  const [target, setTarget] = useState<AdminCompanyRow | null>(null);
  const [form, setForm] = useState<CreditForm>({ approved: false, limit: "", termsDays: "" });
  const [saving, setSaving] = useState(false);
  const [busyToggle, setBusyToggle] = useState<string | null>(null);
  const detail = useAsync(() => (target ? supplierCommerceApi.adminCompanyCredit(target.id) : Promise.resolve(null)), [target?.id]);

  useEffect(() => {
    if (!target) return;
    setForm({
      approved: !!target.creditApproved,
      limit: target.creditLimit === null || target.creditLimit === undefined ? "" : String(target.creditLimit),
      termsDays: target.creditTermsDays === null || target.creditTermsDays === undefined ? "" : String(target.creditTermsDays),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const rows = useMemo(() => {
    const all = state.data?.data ?? [];
    return all
      .filter((c) => (typeFilter === "" ? true : typeFilter === "BUYERS" ? c.type !== "SUPPLIER" : c.type === typeFilter))
      .filter((c) => (approvedOnly ? !!c.creditApproved : true))
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || Number(!!b.creditApproved) - Number(!!a.creditApproved) || a.name.localeCompare(b.name));
  }, [state.data, typeFilter, approvedOnly]);

  const listed = state.data?.data ?? [];
  const approvedCount = listed.filter((c) => c.creditApproved).length;
  const totalLimit = listed.filter((c) => c.creditApproved).reduce((s, c) => s + num(c.creditLimit), 0);
  const totalUsed = listed.reduce((s, c) => s + num(c.creditUsed), 0);

  const applyCredit = (companyId: string, credit: { approved: boolean; limit: number; used: number; termsDays: number }) => {
    state.setData((prev) => (prev ? { ...prev, data: prev.data.map((c) => (c.id === companyId ? { ...c, creditApproved: credit.approved, creditLimit: credit.limit, creditUsed: credit.used, creditTermsDays: credit.termsDays } : c)) } : prev));
  };

  const quickToggle = async (c: AdminCompanyRow, next: boolean) => {
    if (next && num(c.creditLimit) <= 0) {
      setTarget(c);
      setFlash({ kind: "error", message: `Set a credit limit for ${c.name} before approving credit terms.` });
      return;
    }
    setBusyToggle(c.id);
    try {
      const res = await supplierCommerceApi.adminUpdateCompanyCredit(c.id, { creditApproved: next });
      applyCredit(c.id, res.credit);
      setFlash({ kind: "success", message: next ? `Credit terms approved for ${c.name}. Their staff have been notified.` : `Credit terms suspended for ${c.name}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyToggle(null);
    }
  };

  const save = async () => {
    if (!target) return;
    const limit = form.limit.trim() === "" ? null : Number(form.limit);
    const termsDays = form.termsDays.trim() === "" ? null : Math.floor(Number(form.termsDays));
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
      setFlash({ kind: "error", message: "Credit limit must be zero or more." });
      return;
    }
    if (termsDays !== null && (!Number.isFinite(termsDays) || termsDays < 0 || termsDays > 180)) {
      setFlash({ kind: "error", message: "Payment terms must be between 0 and 180 days." });
      return;
    }
    if (form.approved && (limit === null || limit <= 0)) {
      setFlash({ kind: "error", message: "Set a positive credit limit before approving credit terms." });
      return;
    }
    setSaving(true);
    try {
      const res = await supplierCommerceApi.adminUpdateCompanyCredit(target.id, { creditApproved: form.approved, creditLimit: limit, creditTermsDays: termsDays });
      applyCredit(target.id, res.credit);
      setFlash({ kind: "success", message: `Credit terms for ${target.name} saved${res.credit.approved ? ` – ${formatSar(res.credit.limit, lang)} net ${res.credit.termsDays} days` : " (not approved)"}.` });
      setTarget(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<AdminCompanyRow>[] = [
    { key: "company", header: "Company", render: (c) => (
      <div>
        <Link href={`/admin/companies/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link>
        <p className="text-xs text-slate-500">{c.city}{c.crNumber ? <span dir="ltr"> · CR {c.crNumber}</span> : null}</p>
      </div>
    ) },
    { key: "type", header: "Type", render: (c) => <span className="inline-flex items-center gap-1.5"><Badge tone={c.type === "SUPPLIER" ? "green" : "blue"}>{TYPE_LABEL[c.type] ?? c.type}</Badge><VerifiedBadge verified={c.verified} /></span> },
    { key: "approved", header: "Credit", render: (c) => (
      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
        <Toggle checked={!!c.creditApproved} onChange={(next) => quickToggle(c, next)} disabled={busyToggle === c.id} label={`Credit terms for ${c.name}`} />
        {c.creditApproved ? <span className="text-emerald-700">Approved</span> : <span className="text-slate-500">Off</span>}
      </label>
    ) },
    { key: "limit", header: "Limit", align: "end", render: (c) => <span className="font-semibold tabular-nums">{c.creditLimit === null || c.creditLimit === undefined ? <span className="font-normal text-slate-400">—</span> : formatSar(num(c.creditLimit), lang)}</span> },
    { key: "used", header: "Used", align: "end", render: (c) => {
      const used = num(c.creditUsed);
      const limit = num(c.creditLimit);
      const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      return (
        <div className="min-w-[120px]">
          <span className={cn("font-semibold tabular-nums", used > limit && limit > 0 ? "text-red-700" : "text-slate-900")}>{formatSar(used, lang)}</span>
          {limit > 0 && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" title={`${pct}% of limit used`}>
              <div className={cn("h-full rounded-full", pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      );
    } },
    { key: "available", header: "Available", align: "end", render: (c) => <span className="tabular-nums text-slate-700">{c.creditApproved ? formatSar(Math.max(0, num(c.creditLimit) - num(c.creditUsed)), lang) : <span className="text-slate-400">—</span>}</span> },
    { key: "terms", header: "Terms", align: "end", render: (c) => <span className="tabular-nums">{c.creditTermsDays === null || c.creditTermsDays === undefined ? <span className="text-slate-400">—</span> : `Net ${c.creditTermsDays}`}</span> },
    { key: "actions", header: "", align: "end", render: (c) => <Button size="sm" variant="outline" onClick={() => setTarget(c)}>Manage</Button> },
  ];

  const info = detail.data;

  return (
    <div>
      <PageHeader
        title={t("admin.credit")}
        subtitle="Net-terms credit for buying companies. Approved companies can pay on account at checkout up to their limit; unpaid credit orders count against it until they are marked paid."
      />
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }} className="grid gap-3 sm:grid-cols-[1fr_200px_auto_auto]">
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company name…" aria-label="Search companies" />
          <Select name="type" aria-label="Company type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} placeholder="All types" options={TYPE_OPTIONS} />
          <label className="flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
            <Toggle checked={approvedOnly} onChange={setApprovedOnly} label="Approved only" />
            Approved only
          </label>
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      <FlashMessage flash={flash} className="mb-4" />

      {state.loading && !state.data ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatTile label="Approved companies" value={formatNumber(approvedCount, lang)} sub={`of ${formatNumber(listed.length, lang)} listed`} tone="brand" />
            <StatTile label="Total credit limit" value={formatSar(totalLimit, lang)} sub="Approved companies, this page" />
            <StatTile label="Total used" value={formatSar(totalUsed, lang)} sub={totalLimit > 0 ? `${Math.round((totalUsed / totalLimit) * 100)}% of the approved limit` : "Unpaid credit orders"} tone={totalLimit > 0 && totalUsed / totalLimit >= 0.9 ? "amber" : "default"} />
          </div>
          <Card className={cn(state.loading && "opacity-60")} aria-busy={state.loading}>
            <Table columns={columns} rows={rows} rowKey={(c) => c.id} empty={<EmptyState title="No companies" description={q || typeFilter || approvedOnly ? "No companies match the current filters." : "Companies register from the buyer or supplier sign-up."} />} />
            {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
          </Card>
        </>
      )}

      <Modal
        open={!!target}
        title={target ? `Credit terms · ${target.name}` : "Credit terms"}
        onClose={() => setTarget(null)}
        footer={<><Button variant="outline" onClick={() => setTarget(null)}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{t("common.save")}</Button></>}
      >
        {target && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Credit approved</p>
                <p className="text-xs text-slate-500">Allows &quot;Pay on account&quot; at checkout. Turning it off blocks new credit orders; existing ones stay due.</p>
              </div>
              <Toggle checked={form.approved} onChange={(next) => setForm({ ...form, approved: next })} label="Credit approved" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Credit limit (SAR)" name="creditLimit" type="number" min={0} step="100" dir="ltr" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} required={form.approved} hint="Whole-basket check at checkout: used + order total must stay within the limit." />
              <Input label="Payment terms (days)" name="creditTermsDays" type="number" min={0} max={180} step={1} dir="ltr" value={form.termsDays} onChange={(e) => setForm({ ...form, termsDays: e.target.value })} placeholder="30" hint="Due date = order date + terms. Blank = 30 days when approved." />
            </div>
            {detail.loading ? <LoadingBlock className="py-4" label="Loading exposure…" /> : detail.error ? <Alert onRetry={detail.reload}>{detail.error}</Alert> : info ? (
              <div className="space-y-2">
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-xl border border-slate-200 px-3 py-2"><dt className="text-xs text-slate-500">Used</dt><dd className="font-semibold tabular-nums">{formatSar(info.credit.used, lang)}</dd></div>
                  <div className="rounded-xl border border-slate-200 px-3 py-2"><dt className="text-xs text-slate-500">Available</dt><dd className="font-semibold tabular-nums">{formatSar(info.credit.available, lang)}</dd></div>
                  <div className={cn("rounded-xl border px-3 py-2", info.overdue > 0 ? "border-red-200 bg-red-50" : "border-slate-200")}><dt className="text-xs text-slate-500">Overdue</dt><dd className={cn("font-semibold tabular-nums", info.overdue > 0 && "text-red-700")}>{formatNumber(info.overdue, lang)}</dd></div>
                </dl>
                <p className="text-xs text-slate-500">{formatNumber(info.openOrders.length, lang)} open credit {info.openOrders.length === 1 ? "order" : "orders"} · {formatNumber(info.settled.orders, lang)} settled ({formatSar(info.settled.amount, lang)})</p>
                {info.openOrders.length > 0 && (
                  <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-xs">
                    {info.openOrders.map((o) => {
                      const overdue = !!o.dueDate && new Date(o.dueDate).getTime() < Date.now();
                      return (
                        <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <Link href={`/admin/orders/${o.id}`} className="font-mono text-brand-700 hover:underline" dir="ltr">{o.reference}</Link>
                          <span className="text-slate-500">{o.company?.name ?? ""}</span>
                          <span className={cn("tabular-nums", overdue ? "font-semibold text-red-700" : "text-slate-600")}>{o.dueDate ? `due ${formatDate(o.dueDate, lang)}` : "no due date"}</span>
                          <span className="font-semibold tabular-nums">{formatSar(o.total, lang)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            <p className="text-xs text-slate-500">Changes are audited and the company&apos;s staff are notified when credit is approved or suspended. <Link href={`/admin/companies/${target.id}`} className="font-medium text-brand-700 hover:underline">Open company →</Link></p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AdminCreditPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminCreditInner />
    </Suspense>
  );
}

export type { CompanyType };
