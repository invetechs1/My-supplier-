"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";
import { SAUDI_CITIES, type Category, type DemandCluster, type DemandClusterDetail, type DemandGapType, type DemandStatus, type LaunchList, type LaunchStatus, type Material } from "@mysupplier/shared";
import { api, errorMessage, openDownload } from "@/lib/api";
import { demandApi, type GapQuery } from "@/lib/api/demand";
import { useAsync, useFlash, type Flash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatNumber, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, StatTile, Table, Textarea, type Column } from "@/components/ui";
import { MaterialAutocomplete } from "@/components/MaterialAutocomplete";

type Tab = "overview" | "unlisted" | "suppliers" | "launch";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "unlisted", label: "Unlisted requests" },
  { value: "suppliers", label: "Listed, needs suppliers" },
  { value: "launch", label: "Launch list" },
];

const GAP_TONE: Record<DemandGapType, "red" | "amber" | "blue" | "green"> = { UNLISTED: "red", NO_OFFERS: "amber", THIN_COVERAGE: "blue", COVERED: "green" };
const GAP_LABEL: Record<DemandGapType, string> = { UNLISTED: "Not in catalogue", NO_OFFERS: "No offers", THIN_COVERAGE: "< 3 offers", COVERED: "Covered" };
const STATUS_TONE: Record<DemandStatus, "slate" | "blue" | "green" | "purple"> = { NEW: "slate", PLANNED: "blue", ADDED: "green", IGNORED: "purple" };
const LAUNCH_TONE: Record<LaunchStatus, "green" | "amber" | "red"> = { READY: "green", NEEDS_SUPPLIERS: "amber", NO_OFFERS: "red" };
const LAUNCH_LABEL: Record<LaunchStatus, string> = { READY: "Ready", NEEDS_SUPPLIERS: "Needs suppliers", NO_OFFERS: "No offers" };

function GapBadge({ type }: { type: DemandGapType }) {
  return <Badge tone={GAP_TONE[type]}>{GAP_LABEL[type]}</Badge>;
}

// ---------------------------------------------------------------------------
// Gap detail modal: signals, status, note, link to an existing product or create one
// ---------------------------------------------------------------------------
function GapModal({ id, onClose, onChanged, onFlash }: { id: string | null; onClose: () => void; onChanged: (c: DemandCluster) => void; onFlash: (f: Flash) => void }) {
  const { lang } = useI18n();
  const state = useAsync(() => (id ? demandApi.gap(id) : Promise.resolve(null)), [id]);
  const categories = useAsync(() => api.categories(), []);
  const gap = state.data as DemandClusterDetail | null;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<Material | null>(null);
  const [mode, setMode] = useState<"view" | "create" | "link">("view");
  const [form, setForm] = useState({ sku: "", name: "", nameAr: "", unit: "", categoryId: "", brand: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!gap) return;
    setNote(gap.note ?? "");
    setMode("view");
    setLinkTarget(null);
    setErrors({});
    const base = gap.label.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "").toUpperCase().slice(0, 24);
    setForm({ sku: base, name: gap.label, nameAr: /[؀-ۿ]/.test(gap.label) ? gap.label : "", unit: gap.unit ?? "piece", categoryId: "", brand: "" });
  }, [gap?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (status: DemandStatus) => {
    if (!gap) return;
    setBusy(status);
    try {
      const updated = await demandApi.updateGap(gap.id, { status, note: note.trim() || null });
      onChanged(updated);
      state.setData((prev) => (prev ? { ...prev, ...updated } : prev));
      onFlash({ kind: "success", message: status === "PLANNED" ? "Marked as planned." : status === "IGNORED" ? "Request ignored; it will no longer trigger notifications." : "Updated." });
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const link = async () => {
    if (!gap || !linkTarget) return;
    setBusy("link");
    try {
      const updated = await demandApi.updateGap(gap.id, { materialId: linkTarget.id, status: "ADDED" });
      onChanged(updated);
      state.setData((prev) => (prev ? { ...prev, ...updated } : prev));
      setMode("view");
      onFlash({ kind: "success", message: `Linked to ${linkTarget.name}. Future requests for this item count towards that product.` });
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!gap) return;
    const next: Record<string, string> = {};
    if (form.sku.trim().length < 2) next.sku = "SKU is required.";
    if (form.name.trim().length < 2) next.name = "English name is required.";
    if (!form.nameAr.trim()) next.nameAr = "Arabic name is required.";
    if (!form.unit.trim()) next.unit = "Unit is required.";
    if (!form.categoryId) next.categoryId = "Choose a category.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy("create");
    try {
      const material = await demandApi.createMaterial(gap.id, { sku: form.sku.trim(), name: form.name.trim(), nameAr: form.nameAr.trim(), unit: form.unit.trim(), categoryId: form.categoryId, brand: form.brand.trim() || null });
      const fresh = await demandApi.gap(gap.id);
      state.setData(fresh);
      onChanged(fresh);
      setMode("view");
      onFlash({ kind: "success", message: `Product "${material.name}" created and linked. Next step: recruit suppliers (it has no offers yet).` });
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const signalColumns: Column<DemandClusterDetail["signals"][number]>[] = [
    { key: "when", header: "When", render: (s) => <span title={formatDate(s.createdAt, lang)}>{timeAgo(s.createdAt)}</span> },
    { key: "source", header: "Source", render: (s) => <Badge tone={s.source === "RFQ" ? "purple" : s.source === "BOQ" ? "blue" : "slate"}>{s.source}</Badge> },
    { key: "text", header: "Requested as", render: (s) => (
      <div className="max-w-[260px]"><span className="block text-slate-800">{s.rawText}</span><span className="block text-xs text-slate-500">{[s.quantity ? `${formatNumber(s.quantity, lang)} ${s.unit ?? ""}` : null, s.city].filter(Boolean).join(" · ") || "—"}</span></div>
    ) },
    { key: "buyer", header: "Buyer", render: (s) => (s.buyer ? <div className="max-w-[160px] text-xs"><span className="block truncate font-medium text-slate-800">{s.buyer.name}</span>{s.buyer.companyName && <span className="block truncate text-slate-500">{s.buyer.companyName}</span>}</div> : <span className="text-xs text-slate-400">guest</span>) },
  ];

  return (
    <Modal open={Boolean(id)} title={gap ? gap.label : "Request"} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {state.loading && !gap ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : gap ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <GapBadge type={gap.gapType} />
            <Badge tone={STATUS_TONE[gap.status]}>{gap.status}</Badge>
            <span className="text-sm text-slate-600">{gap.requests} requests · {gap.buyers} distinct buyer{gap.buyers === 1 ? "" : "s"} · score {gap.score}</span>
            {gap.topCities.length > 0 && <span className="text-sm text-slate-500">· {gap.topCities.map((c) => `${c.city} (${c.count})`).join(", ")}</span>}
          </div>
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900"><strong>Suggestion:</strong> {gap.suggestion}.{gap.material && <> Product: <Link href={`/shop/products/${gap.material.id}`} target="_blank" className="font-semibold underline">{gap.material.name}</Link> ({gap.material.sku}), {gap.offerCount} live offer{gap.offerCount === 1 ? "" : "s"}.</>}</p>

          {gap.gapType === "UNLISTED" && mode === "view" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMode("create")}>Create this product</Button>
              <Button size="sm" variant="outline" onClick={() => setMode("link")}>Link to an existing product</Button>
            </div>
          )}
          {mode === "link" && (
            <Card><CardBody className="space-y-3">
              <MaterialAutocomplete label="Existing product" value={linkTarget} onChange={setLinkTarget} placeholder="Search the catalogue by name or SKU…" />
              <div className="flex gap-2"><Button size="sm" onClick={link} loading={busy === "link"} disabled={!linkTarget}>Link</Button><Button size="sm" variant="ghost" onClick={() => setMode("view")}>Cancel</Button></div>
            </CardBody></Card>
          )}
          {mode === "create" && (
            <Card><CardHeader title="Create product from this request" subtitle="It appears in the shop immediately; suppliers can then add prices." /><CardBody className="grid gap-3 sm:grid-cols-2">
              <Input label="Name (English)" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required />
              <Input label="Name (Arabic)" name="nameAr" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} error={errors.nameAr} required />
              <Input label="SKU" name="sku" dir="ltr" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} error={errors.sku} required />
              <Input label="Unit" name="unit" dir="ltr" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} error={errors.unit} placeholder="piece, m2, ton, bag…" required />
              <Select label="Category" name="categoryId" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} placeholder="Choose…" options={(categories.data ?? []).map((c: Category) => ({ value: c.id, label: c.name }))} error={errors.categoryId} required />
              <Input label="Brand (optional)" name="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              <div className="flex gap-2 sm:col-span-2"><Button size="sm" onClick={create} loading={busy === "create"}>Create & link</Button><Button size="sm" variant="ghost" onClick={() => setMode("view")}>Cancel</Button></div>
            </CardBody></Card>
          )}

          <div>
            <Textarea label="Internal note" name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Asked 3 suppliers in Riyadh, waiting for prices" />
            <div className="mt-2 flex flex-wrap gap-2">
              {gap.status !== "PLANNED" && <Button size="sm" variant="outline" onClick={() => setStatus("PLANNED")} loading={busy === "PLANNED"}>Mark planned</Button>}
              {gap.status !== "IGNORED" && <Button size="sm" variant="outline" onClick={() => setStatus("IGNORED")} loading={busy === "IGNORED"}>Ignore</Button>}
              {gap.status !== "NEW" && <Button size="sm" variant="ghost" onClick={() => setStatus("NEW")} loading={busy === "NEW"}>Reopen</Button>}
              <Button size="sm" variant="ghost" onClick={() => setStatus(gap.status)} loading={busy === gap.status}>Save note</Button>
            </div>
          </div>

          {gap.examples.length > 1 && <p className="text-xs text-slate-500">Also requested as: {gap.examples.slice(1).join(" · ")}</p>}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Latest requests</h4>
            <Table columns={signalColumns} rows={gap.signals} rowKey={(s) => s.id} empty={<EmptyState title="No signals" />} />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Gaps table (shared by the overview, unlisted and needs-suppliers tabs)
// ---------------------------------------------------------------------------
function GapsTable({ rows, onOpen, lang, compact = false }: { rows: DemandCluster[]; onOpen: (id: string) => void; lang: "en" | "ar"; compact?: boolean }) {
  const columns: Column<DemandCluster>[] = [
    { key: "label", header: "Requested product", render: (g) => (
      <button type="button" onClick={() => onOpen(g.id)} className="text-start">
        <span className="block font-medium text-brand-700 hover:underline">{g.label}</span>
        {g.material && <span className="block font-mono text-[11px] text-slate-500" dir="ltr">{g.material.sku}</span>}
        {!compact && g.examples.length > 1 && <span className="block max-w-[320px] truncate text-xs text-slate-500" title={g.examples.join(" · ")}>{g.examples.slice(1, 3).join(" · ")}</span>}
      </button>
    ) },
    { key: "type", header: "Gap", render: (g) => <GapBadge type={g.gapType} /> },
    { key: "requests", header: "Requests", align: "end", render: (g) => <span className="font-semibold tabular-nums">{g.requests}</span> },
    { key: "buyers", header: "Buyers", align: "end", render: (g) => <span className="tabular-nums">{g.buyers}</span> },
    { key: "qty", header: "Qty asked", align: "end", render: (g) => (g.totalQuantity ? `${formatNumber(Math.round(g.totalQuantity), lang)} ${g.unit ?? ""}` : "—") },
    { key: "cities", header: "Cities", render: (g) => <span className="text-xs text-slate-600">{g.topCities.slice(0, 3).map((c) => `${c.city} ${c.count}`).join(" · ") || "—"}</span> },
    { key: "last", header: "Last", render: (g) => <span className="text-xs text-slate-500" title={formatDate(g.lastRequestedAt, lang)}>{timeAgo(g.lastRequestedAt)}</span> },
    { key: "score", header: "Score", align: "end", render: (g) => <span className="font-semibold tabular-nums text-brand-700">{g.score}</span> },
    { key: "status", header: "Status", render: (g) => <Badge tone={STATUS_TONE[g.status]}>{g.status}</Badge> },
    { key: "action", header: "", align: "end", render: (g) => <Button size="sm" variant="outline" onClick={() => onOpen(g.id)}>{g.gapType === "UNLISTED" ? "Review / add" : "Review"}</Button> },
  ];
  return <Table columns={columns} rows={rows} rowKey={(g) => g.id} empty={<EmptyState title="Nothing here yet" description="Requests appear as soon as buyers analyse a BOQ, publish an RFQ or search for something we do not list." />} />;
}

function OverviewTab({ days, onOpen }: { days: number; onOpen: (id: string) => void }) {
  const { lang } = useI18n();
  const state = useAsync(() => demandApi.overview(days), [days]);
  const o = state.data;
  if (state.loading && !o) return <LoadingBlock />;
  if (state.error) return <Alert onRetry={state.reload}>{state.error}</Alert>;
  if (!o) return null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`Requests (last ${days} days)`} value={formatNumber(o.signals, lang)} sub={`BOQ ${o.bySource.BOQ ?? 0} · RFQ ${o.bySource.RFQ ?? 0} · Search ${o.bySource.SEARCH ?? 0}`} />
        <StatTile label="Unmatched requests" value={`${o.unmatchedPct}%`} sub={`${formatNumber(o.unmatchedSignals, lang)} lines we could not match to a product`} tone={o.unmatchedPct > 25 ? "amber" : "default"} />
        <StatTile label="Open gaps" value={formatNumber(o.openGaps, lang)} sub={`${o.byType.UNLISTED ?? 0} unlisted · ${o.byType.NO_OFFERS ?? 0} no offers · ${o.byType.THIN_COVERAGE ?? 0} thin`} tone="brand" />
        <StatTile label="Top cities" value={o.topCities[0]?.city ?? "—"} sub={o.topCities.slice(0, 4).map((c) => `${c.city} ${c.count}`).join(" · ") || "No city data yet"} />
      </div>
      <Card>
        <CardHeader title="What to add or recruit suppliers for next" subtitle="Ranked by distinct buyers, request count, quantity and recency. Open a row to create the product, link it to an existing one, plan it or ignore it." />
        <GapsTable rows={o.topGaps} onOpen={onOpen} lang={lang} compact />
      </Card>
      <Card>
        <CardHeader title="How this works" />
        <CardBody className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
          <p><strong className="text-slate-900">1. Capture.</strong> Every BOQ line a buyer analyses, every RFQ item they publish and every search that returns nothing becomes a request, matched to the catalogue when possible.</p>
          <p><strong className="text-slate-900">2. Group & notify.</strong> Different spellings of the same item are grouped. When a gap reaches 3, 10, 25 or 50 requests you receive a notification and an email, plus a weekly digest every Sunday.</p>
          <p><strong className="text-slate-900">3. Act.</strong> Create the product in one click, or send the “needs suppliers” list to outreach. The launch list tab tracks the rule: 3 fresh offers per product before you call a city open.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function GapsTab({ gapType, onOpen, version }: { gapType: "UNLISTED" | "LISTED"; onOpen: (id: string) => void; version: number }) {
  const { lang } = useI18n();
  const [status, setStatus] = useState<DemandStatus | "">("");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<NonNullable<GapQuery["sort"]>>("score");
  const [days, setDays] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => demandApi.gaps({ gapType, status: status || undefined, city: city || undefined, q: q || undefined, sort, days: days ? Number(days) : undefined, page, pageSize: 25 }), [gapType, status, city, q, sort, days, page, version]);
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }}>
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requests…" className="w-56" />
          <Button type="submit" size="sm" variant="outline">Search</Button>
        </form>
        <Select name="status" value={status} onChange={(e) => { setStatus(e.target.value as DemandStatus | ""); setPage(1); }} placeholder="All statuses" options={["NEW", "PLANNED", "ADDED", "IGNORED"].map((s) => ({ value: s, label: s }))} className="w-40" />
        <Select name="city" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} placeholder="All cities" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} className="w-40" />
        <Select name="days" value={days} onChange={(e) => { setDays(e.target.value); setPage(1); }} placeholder="All time" options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} className="w-40" />
        <Select name="sort" value={sort} onChange={(e) => setSort(e.target.value as NonNullable<GapQuery["sort"]>)} options={[{ value: "score", label: "Sort: score" }, { value: "requests", label: "Sort: requests" }, { value: "buyers", label: "Sort: buyers" }, { value: "recent", label: "Sort: most recent" }]} className="w-44" />
        {state.data && <span className="ms-auto text-sm text-slate-500">{state.data.total} request group{state.data.total === 1 ? "" : "s"}</span>}
      </div>
      {state.loading && !state.data ? <LoadingBlock /> : state.error ? <div className="p-5"><Alert onRetry={state.reload}>{state.error}</Alert></div> : (
        <>
          <GapsTable rows={state.data?.data ?? []} onOpen={onOpen} lang={lang} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </>
      )}
    </Card>
  );
}

function LaunchTab() {
  const { lang } = useI18n();
  const [city, setCity] = useState("Riyadh");
  const [size, setSize] = useState("200");
  const [freshDays, setFreshDays] = useState("14");
  const [status, setStatus] = useState<LaunchStatus | "">("");
  const state = useAsync(() => demandApi.launchList({ city: city || undefined, size: Number(size), freshDays: Number(freshDays), status: status || undefined }), [city, size, freshDays, status]);
  const list = state.data as LaunchList | null;
  const columns: Column<LaunchList["items"][number]>[] = [
    { key: "rank", header: "#", render: (i) => <span className="tabular-nums text-slate-500">{list ? list.items.indexOf(i) + 1 : ""}</span> },
    { key: "name", header: "Product", render: (i) => (
      <div className="max-w-[280px]"><Link href={`/shop/products/${i.id}`} target="_blank" className="block truncate font-medium text-brand-700 hover:underline">{i.name}</Link><span className="block text-xs text-slate-500"><span className="font-mono" dir="ltr">{i.sku}</span> · {i.category.name}</span></div>
    ) },
    { key: "score", header: "Priority", align: "end", render: (i) => <span className="font-semibold tabular-nums">{i.score}</span> },
    { key: "demand", header: "Requests / buyers", align: "end", render: (i) => <span className="tabular-nums">{i.requests} / {i.buyers}</span> },
    { key: "offers", header: `Offers (fresh ≤ ${freshDays}d)`, align: "end", render: (i) => <span className="tabular-nums">{i.offers} <span className="text-slate-500">({i.freshOffers})</span></span> },
    { key: "suppliers", header: "Suppliers", align: "end", render: (i) => <span className="tabular-nums">{i.suppliers}</span> },
    { key: "status", header: "Readiness", render: (i) => <Badge tone={LAUNCH_TONE[i.status]}>{LAUNCH_LABEL[i.status]}{i.needed ? ` · ${i.needed} more` : ""}</Badge> },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <Select label="City" name="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="All cities" options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} className="w-44" />
          <Select label="List size" name="size" value={size} onChange={(e) => setSize(e.target.value)} options={["100", "200", "300", "500", "1000"].map((s) => ({ value: s, label: `${s} products` }))} className="w-40" />
          <Select label="Fresh within" name="fresh" value={freshDays} onChange={(e) => setFreshDays(e.target.value)} options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} className="w-36" />
          <Select label="Show" name="status" value={status} onChange={(e) => setStatus(e.target.value as LaunchStatus | "")} placeholder="All" options={(["READY", "NEEDS_SUPPLIERS", "NO_OFFERS"] as LaunchStatus[]).map((s) => ({ value: s, label: LAUNCH_LABEL[s] }))} className="w-44" />
          <Button variant="outline" className="ms-auto" onClick={() => void openDownload(demandApi.launchListCsvPath(), "_blank", { city: city || undefined, size })}>Download CSV</Button>
        </div>
      </Card>
      {state.loading && !list ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : list ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={`Coverage in ${city || "all cities"}`} value={`${list.summary.coveragePct}%`} sub={list.summary.launchReady ? "Launch-ready (≥ 80% of the list has 3 fresh offers)" : "Target: 80% of the list with 3 fresh offers before opening the city"} tone={list.summary.launchReady ? "brand" : "amber"} />
            <StatTile label="Ready" value={formatNumber(list.summary.ready, lang)} sub="3 or more fresh supplier offers" />
            <StatTile label="Needs suppliers" value={formatNumber(list.summary.needsSuppliers, lang)} sub="Some offers, fewer than 3 fresh" />
            <StatTile label="No offers" value={formatNumber(list.summary.noOffers, lang)} sub="Recruit suppliers first" />
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className={cn("h-full rounded-full", list.summary.launchReady ? "bg-brand-600" : "bg-amber-500")} style={{ width: `${list.summary.coveragePct}%` }} /></div>
          <Card>
            <CardHeader title={`Top ${list.items.length} products to have live first`} subtitle="Priority = observed demand (requests, distinct buyers, quantity, recency) + catalogue popularity. Hand the “needs suppliers” rows to supplier outreach." action={<Link href="/admin/outreach" className="text-sm font-semibold text-brand-700 hover:underline">Open outreach →</Link>} />
            <Table columns={columns} rows={list.items} rowKey={(i) => i.id} empty={<EmptyState title="No products" />} />
          </Card>
        </>
      ) : null}
    </div>
  );
}

function AdminDemandInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(() => (TABS.some((x) => x.value === params.get("tab")) ? (params.get("tab") as Tab) : "overview"));
  const [openId, setOpenId] = useState<string | null>(() => params.get("gap"));
  const [days, setDays] = useState(30);
  const [flash, setFlash] = useFlash(6000);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams();
    if (tab !== "overview") next.set("tab", tab);
    if (openId) next.set("gap", openId);
    const qs = next.toString();
    if (qs !== params.toString()) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, openId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await demandApi.refresh();
      setFlash({ kind: "success", message: `Coverage refreshed (${r.updated} group${r.updated === 1 ? "" : "s"} updated).` });
      setVersion((v) => v + 1);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("admin.demand")}
        subtitle="What buyers ask for in BOQs, RFQs and searches, compared with what the catalogue and suppliers actually cover. Use it to decide the next products to add and where to recruit suppliers."
        action={<div className="flex items-center gap-2">
          {tab === "overview" && <Select name="days" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last year" }]} className="w-40" />}
          <Button variant="outline" onClick={refresh} loading={refreshing}>Refresh coverage</Button>
        </div>}
      />
      <FlashMessage flash={flash} className="mb-4" />
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((x) => (
          <button key={x.value} type="button" onClick={() => setTab(x.value)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-semibold", tab === x.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>{x.label}</button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab key={version} days={days} onOpen={setOpenId} />}
      {tab === "unlisted" && <GapsTab gapType="UNLISTED" onOpen={setOpenId} version={version} />}
      {tab === "suppliers" && <GapsTab gapType="LISTED" onOpen={setOpenId} version={version} />}
      {tab === "launch" && <LaunchTab />}
      <GapModal id={openId} onClose={() => setOpenId(null)} onChanged={() => setVersion((v) => v + 1)} onFlash={setFlash} />
    </div>
  );
}

export default function AdminDemandPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminDemandInner />
    </Suspense>
  );
}
