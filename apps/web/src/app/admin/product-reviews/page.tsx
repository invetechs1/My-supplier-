"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { errorMessage } from "@/lib/api";
import { supplierCommerceApi, type AdminProductQuestion, type AdminProductReview } from "@/lib/api/supplierCommerce";
import { useAsync, useFlash, type Flash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatNumber } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Stars, StatTile, Table, type Column } from "@/components/ui";

type Tab = "reviews" | "questions";
type Visibility = "" | "true" | "false";

const dim = (hidden: boolean, cls = "") => cn(hidden && "opacity-50", cls);

function ProductCell({ material, materialId, hidden }: { material?: { id: string; name: string; sku: string } | null; materialId: string; hidden: boolean }) {
  return (
    <div className={dim(hidden, "max-w-[220px]")}>
      <Link href={`/shop/products/${material?.id ?? materialId}`} target="_blank" rel="noreferrer" className="block truncate font-medium text-brand-700 hover:underline" title={material?.name}>{material?.name ?? materialId}</Link>
      {material?.sku && <p className="font-mono text-[11px] text-slate-500" dir="ltr">{material.sku}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviews tab
// ---------------------------------------------------------------------------
function ReviewsTab({ onFlash }: { onFlash: (f: Flash) => void }) {
  const { t, lang } = useI18n();
  const [rating, setRating] = useState("");
  const [hidden, setHidden] = useState<Visibility>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => supplierCommerceApi.adminProductReviews({ rating: rating ? Number(rating) : undefined, hidden, q: q || undefined, page }), [rating, hidden, q, page]);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminProductReview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggleHidden = async (r: AdminProductReview) => {
    setBusy(r.id);
    try {
      const updated = await supplierCommerceApi.adminSetProductReviewHidden(r.id, !r.hidden);
      state.setData((prev) => (prev ? { ...prev, data: prev.data.map((x) => (x.id === r.id ? { ...x, ...updated } : x)), summary: { ...prev.summary, hidden: prev.summary.hidden + (updated.hidden ? 1 : -1) } } : prev));
      onFlash({ kind: "success", message: updated.hidden ? "Review hidden from the product page; the product rating has been recomputed." : "Review is visible again." });
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supplierCommerceApi.adminDeleteProductReview(deleteTarget.id);
      onFlash({ kind: "success", message: "Review deleted." });
      setDeleteTarget(null);
      state.reload();
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<AdminProductReview>[] = [
    { key: "date", header: "Date", render: (r) => <span className={dim(r.hidden, "whitespace-nowrap text-slate-500")}>{formatDate(r.createdAt, lang)}</span> },
    { key: "product", header: "Product", render: (r) => <ProductCell material={r.material} materialId={r.materialId} hidden={r.hidden} /> },
    { key: "buyer", header: "Buyer", render: (r) => (
      <div className={dim(r.hidden)}>
        <p className="font-medium text-slate-900">{r.user?.name ?? "—"}</p>
        {r.user?.companyName && <p className="text-xs text-slate-500">{r.user.companyName}</p>}
      </div>
    ) },
    { key: "rating", header: "Rating", render: (r) => <span className={dim(r.hidden, "inline-flex items-center gap-1.5")}><Stars value={r.rating} />{r.verified && <Badge tone="green" title="Bought this product">Verified</Badge>}</span> },
    { key: "review", header: "Review", render: (r) => (
      <div className={dim(r.hidden, "max-w-[300px]")}>
        {r.title && <p className="truncate text-sm font-medium text-slate-900" title={r.title}>{r.title}</p>}
        {r.body ? <p className="line-clamp-2 text-xs text-slate-600" title={r.body}>{r.body}</p> : !r.title && <span className="text-slate-400">—</span>}
        {r.helpful > 0 && <p className="text-[11px] text-slate-400">{r.helpful} helpful</p>}
      </div>
    ) },
    { key: "reply", header: "Supplier reply", render: (r) => r.supplierReply ? <p className={dim(r.hidden, "max-w-[200px] truncate text-xs text-slate-500")} title={r.supplierReply}>{r.supplierReply}</p> : <span className="text-slate-400">—</span> },
    { key: "visibility", header: "Visibility", render: (r) => <Badge tone={r.hidden ? "slate" : "green"}>{r.hidden ? "Hidden" : "Visible"}</Badge> },
    { key: "actions", header: "", align: "end", render: (r) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => toggleHidden(r)} loading={busy === r.id}>{r.hidden ? "Unhide" : "Hide"}</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(r)}>{t("common.delete")}</Button>
      </div>
    ) },
  ];

  const summary = state.data?.summary;
  return (
    <>
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }} className="grid gap-3 sm:grid-cols-[1fr_160px_160px_auto]">
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, body, product or buyer…" />
          <Select name="rating" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} placeholder="All ratings" options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` }))} />
          <Select name="hidden" value={hidden} onChange={(e) => { setHidden(e.target.value as Visibility); setPage(1); }} options={[{ value: "", label: "All reviews" }, { value: "false", label: "Visible only" }, { value: "true", label: "Hidden only" }]} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      {state.loading && !state.data ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <>
          {summary && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <StatTile label="Average rating" value={<span className="inline-flex items-center gap-2">{summary.average.toFixed(1)}<Stars value={summary.average} size="md" /></span>} sub="Across visible product reviews" />
              <StatTile label="Total reviews" value={formatNumber(summary.total, lang)} sub={q || rating || hidden ? `${formatNumber(state.data?.total ?? 0, lang)} match the filters` : "Visible reviews"} />
              <StatTile label="Hidden" value={formatNumber(summary.hidden, lang)} tone={summary.hidden > 0 ? "amber" : "default"} sub="Excluded from ratings" />
            </div>
          )}
          <Card className={cn(state.loading && "opacity-60")} aria-busy={state.loading}>
            <Table columns={columns} rows={state.data?.data ?? []} rowKey={(r) => r.id} empty={<EmptyState title="No reviews" description={q || rating || hidden ? "No reviews match the current filters." : "Buyers can review products they have bought."} />} />
            {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
          </Card>
        </>
      )}
      <Modal open={!!deleteTarget} title="Delete review" onClose={() => setDeleteTarget(null)} footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={remove} loading={deleting}>{t("common.delete")}</Button></>}>
        {deleteTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Permanently delete this {deleteTarget.rating}-star review by <span className="font-medium text-slate-900">{deleteTarget.user?.name ?? "the buyer"}</span> of <span className="font-medium text-slate-900">{deleteTarget.material?.name ?? "the product"}</span>?</p>
            <p className="text-xs text-slate-500">This cannot be undone and recomputes the product rating. Prefer hiding the review if you may need it later.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Questions tab
// ---------------------------------------------------------------------------
function QuestionsTab({ onFlash }: { onFlash: (f: Flash) => void }) {
  const { t, lang } = useI18n();
  const [answered, setAnswered] = useState<Visibility>("");
  const [hidden, setHidden] = useState<Visibility>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const state = useAsync(() => supplierCommerceApi.adminProductQuestions({ answered, hidden, q: q || undefined, page }), [answered, hidden, q, page, tick]);
  const counts = useAsync(async () => {
    const [all, unanswered, hiddenRes] = await Promise.all([
      supplierCommerceApi.adminProductQuestions({ pageSize: 1 }),
      supplierCommerceApi.adminProductQuestions({ answered: "false", hidden: "false", pageSize: 1 }),
      supplierCommerceApi.adminProductQuestions({ hidden: "true", pageSize: 1 }),
    ]);
    return { total: all.total, unanswered: unanswered.total, hidden: hiddenRes.total };
  }, [tick]);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminProductQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggleHidden = async (qu: AdminProductQuestion) => {
    setBusy(qu.id);
    try {
      const updated = await supplierCommerceApi.adminSetProductQuestionHidden(qu.id, !qu.hidden);
      state.setData((prev) => (prev ? { ...prev, data: prev.data.map((x) => (x.id === qu.id ? { ...x, ...updated, material: x.material } : x)) } : prev));
      counts.setData((prev) => (prev ? { ...prev, hidden: prev.hidden + (updated.hidden ? 1 : -1) } : prev));
      onFlash({ kind: "success", message: updated.hidden ? "Question hidden from the product page." : "Question is visible again." });
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supplierCommerceApi.adminDeleteProductQuestion(deleteTarget.id);
      onFlash({ kind: "success", message: "Question deleted." });
      setDeleteTarget(null);
      setTick((n) => n + 1);
    } catch (err) {
      onFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<AdminProductQuestion>[] = [
    { key: "date", header: "Date", render: (qu) => <span className={dim(qu.hidden, "whitespace-nowrap text-slate-500")}>{formatDate(qu.createdAt, lang)}</span> },
    { key: "product", header: "Product", render: (qu) => <ProductCell material={qu.material} materialId={qu.materialId} hidden={qu.hidden} /> },
    { key: "asker", header: "Asked by", render: (qu) => (
      <div className={dim(qu.hidden)}>
        <p className="font-medium text-slate-900">{qu.user?.name ?? "—"}</p>
        {qu.user?.companyName && <p className="text-xs text-slate-500">{qu.user.companyName}</p>}
      </div>
    ) },
    { key: "question", header: "Question", render: (qu) => <p className={dim(qu.hidden, "line-clamp-2 max-w-[320px] text-sm text-slate-800")} title={qu.question}>{qu.question}</p> },
    { key: "answer", header: "Answer", render: (qu) => qu.answer ? (
      <div className={dim(qu.hidden, "max-w-[280px]")}>
        <p className="line-clamp-2 text-xs text-slate-600" title={qu.answer}>{qu.answer}</p>
        <p className="text-[11px] text-slate-400">{qu.answeredBy?.name ?? "—"}{qu.answeredBy?.companyName ? ` · ${qu.answeredBy.companyName}` : ""}{qu.answeredAt ? ` · ${formatDate(qu.answeredAt, lang)}` : ""}</p>
      </div>
    ) : <Badge tone="amber">Unanswered</Badge> },
    { key: "visibility", header: "Visibility", render: (qu) => <Badge tone={qu.hidden ? "slate" : "green"}>{qu.hidden ? "Hidden" : "Visible"}</Badge> },
    { key: "actions", header: "", align: "end", render: (qu) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => toggleHidden(qu)} loading={busy === qu.id}>{qu.hidden ? "Unhide" : "Hide"}</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(qu)}>{t("common.delete")}</Button>
      </div>
    ) },
  ];

  return (
    <>
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }} className="grid gap-3 sm:grid-cols-[1fr_170px_160px_auto]">
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search question, answer or product…" />
          <Select name="answered" value={answered} onChange={(e) => { setAnswered(e.target.value as Visibility); setPage(1); }} options={[{ value: "", label: "Answered & open" }, { value: "false", label: "Unanswered only" }, { value: "true", label: "Answered only" }]} />
          <Select name="hidden" value={hidden} onChange={(e) => { setHidden(e.target.value as Visibility); setPage(1); }} options={[{ value: "", label: "All questions" }, { value: "false", label: "Visible only" }, { value: "true", label: "Hidden only" }]} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      {state.loading && !state.data ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatTile label="Total questions" value={counts.data ? formatNumber(counts.data.total, lang) : "…"} sub={q || answered || hidden ? `${formatNumber(state.data?.total ?? 0, lang)} match the filters` : "All products"} />
            <StatTile label="Unanswered" value={counts.data ? formatNumber(counts.data.unanswered, lang) : "…"} tone={(counts.data?.unanswered ?? 0) > 0 ? "amber" : "default"} sub="Visible questions waiting for a supplier or admin" />
            <StatTile label="Hidden" value={counts.data ? formatNumber(counts.data.hidden, lang) : "…"} sub="Not shown on product pages" />
          </div>
          <Card className={cn(state.loading && "opacity-60")} aria-busy={state.loading}>
            <Table columns={columns} rows={state.data?.data ?? []} rowKey={(qu) => qu.id} empty={<EmptyState title="No questions" description={q || answered || hidden ? "No questions match the current filters." : "Buyers can ask questions on any product page."} />} />
            {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
          </Card>
        </>
      )}
      <Modal open={!!deleteTarget} title="Delete question" onClose={() => setDeleteTarget(null)} footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={remove} loading={deleting}>{t("common.delete")}</Button></>}>
        {deleteTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-slate-800">&ldquo;{deleteTarget.question}&rdquo;</p>
            <p>Delete this question{deleteTarget.answer ? " and its answer" : ""} on <span className="font-medium text-slate-900">{deleteTarget.material?.name ?? "the product"}</span>? This cannot be undone.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function AdminProductReviewsInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "questions" ? "questions" : "reviews");
  const [flash, setFlash] = useFlash(6000);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "reviews", label: "Reviews" },
    { id: "questions", label: "Questions" },
  ];
  return (
    <div>
      <PageHeader title={t("admin.productReviews")} subtitle="Moderate buyer reviews and questions on products. Hidden items disappear from product pages; hiding or deleting a review recomputes the product's rating." />
      <div role="tablist" aria-label="Product engagement" className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map((tb) => (
          <button key={tb.id} role="tab" type="button" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600", tab === tb.id ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}>{tb.label}</button>
        ))}
      </div>
      <FlashMessage flash={flash} className="mb-4" />
      {tab === "reviews" ? <ReviewsTab onFlash={setFlash} /> : <QuestionsTab onFlash={setFlash} />}
    </div>
  );
}

export default function AdminProductReviewsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminProductReviewsInner />
    </Suspense>
  );
}
