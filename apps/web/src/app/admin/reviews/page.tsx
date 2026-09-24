"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { AdminReview } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Stars, StatTile, Table, Textarea, type Column } from "@/components/ui";

type Visibility = "" | "true" | "false";

export default function AdminReviewsPage() {
  const { t, lang } = useI18n();
  const [rating, setRating] = useState("");
  const [hidden, setHidden] = useState<Visibility>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.adminReviews({ rating: rating ? Number(rating) : undefined, hidden, q: q || undefined, page }), [rating, hidden, q, page]);
  const [flash, setFlash] = useFlash();

  const [busy, setBusy] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<AdminReview | null>(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const patchRow = (updated: AdminReview) => {
    state.setData((prev) => (prev ? { ...prev, data: prev.data.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)) } : prev));
  };

  const toggleHidden = async (r: AdminReview) => {
    setBusy(r.id);
    try {
      const updated = await api.adminUpdateReview(r.id, { hidden: !r.hidden });
      patchRow(updated);
      state.setData((prev) => (prev ? { ...prev, summary: { ...prev.summary, hidden: prev.summary.hidden + (updated.hidden ? 1 : -1) } } : prev));
      setFlash({ kind: "success", message: updated.hidden ? "Review hidden from the supplier profile." : "Review is visible again." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const openReply = (r: AdminReview) => {
    setReply(r.reply ?? "");
    setReplyTarget(r);
  };

  const submitReply = async () => {
    if (!replyTarget) return;
    setReplying(true);
    try {
      const text = reply.trim();
      const updated = await api.adminUpdateReview(replyTarget.id, { reply: text || null });
      patchRow(updated);
      setFlash({ kind: "success", message: text ? "Reply posted." : "Reply removed." });
      setReplyTarget(null);
      setReply("");
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setReplying(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.adminDeleteReview(deleteTarget.id);
      setFlash({ kind: "success", message: "Review deleted." });
      setDeleteTarget(null);
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const dim = (r: AdminReview, cls = "") => `${r.hidden ? "opacity-50 " : ""}${cls}`.trim();

  const columns: Column<AdminReview>[] = [
    { key: "date", header: "Date", render: (r) => <span className={dim(r, "whitespace-nowrap text-slate-500")}>{formatDate(r.createdAt, lang)}</span> },
    { key: "supplier", header: "Supplier", render: (r) => (
      <span className={dim(r)}>
        {r.company ? <Link href={`/admin/companies/${r.company.id}`} className="font-medium text-brand-700 hover:underline">{r.company.name}</Link> : <span className="text-slate-400">—</span>}
      </span>
    ) },
    { key: "buyer", header: "Buyer", render: (r) => (
      <div className={dim(r)}>
        <p className="font-medium text-slate-900">{r.buyer?.name ?? "—"}</p>
        {r.buyer?.company?.name && <p className="text-xs text-slate-500">{r.buyer.company.name}</p>}
      </div>
    ) },
    { key: "order", header: "Order", render: (r) => (
      <span className={dim(r)}>
        {r.order ? <Link href={`/admin/orders/${r.order.id}`} className="font-mono text-xs text-brand-700 hover:underline" dir="ltr">{r.order.reference}</Link> : <span className="text-slate-400">—</span>}
      </span>
    ) },
    { key: "rating", header: "Rating", render: (r) => <span className={dim(r)}><Stars value={r.rating} /></span> },
    { key: "comment", header: "Comment", render: (r) => (
      r.comment ? <p className={dim(r, "max-w-[260px] truncate text-slate-700")} title={r.comment}>{r.comment}</p> : <span className="text-slate-400">—</span>
    ) },
    { key: "reply", header: "Supplier reply", render: (r) => (
      r.reply ? <p className={dim(r, "max-w-[220px] truncate text-xs text-slate-500")} title={r.reply}>{r.reply}</p> : <span className="text-slate-400">—</span>
    ) },
    { key: "visibility", header: "Visibility", render: (r) => <Badge tone={r.hidden ? "slate" : "green"}>{r.hidden ? "Hidden" : "Visible"}</Badge> },
    { key: "actions", header: "", align: "end", render: (r) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => toggleHidden(r)} loading={busy === r.id}>{r.hidden ? "Unhide" : "Hide"}</Button>
        <Button size="sm" variant="outline" onClick={() => openReply(r)}>Reply</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(r)}>{t("common.delete")}</Button>
      </div>
    ) },
  ];

  const summary = state.data?.summary;

  return (
    <div>
      <PageHeader title={t("admin.reviews")} subtitle="Moderate buyer reviews of suppliers. Hidden reviews are excluded from supplier profiles and rating averages; replies posted here appear as the platform's response." />
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }} className="grid gap-3 sm:grid-cols-[1fr_160px_160px_auto]">
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search comment, buyer or supplier…" />
          <Select name="rating" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} placeholder="All ratings" options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` }))} />
          <Select name="hidden" value={hidden} onChange={(e) => { setHidden(e.target.value as Visibility); setPage(1); }} options={[{ value: "", label: "All reviews" }, { value: "false", label: "Visible only" }, { value: "true", label: "Hidden only" }]} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <>
          {summary && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <StatTile label="Average rating" value={<span className="inline-flex items-center gap-2">{summary.average.toFixed(1)}<Stars value={summary.average} size="md" /></span>} sub="Across visible reviews" />
              <StatTile label="Total reviews" value={formatNumber(summary.total, lang)} />
              <StatTile label="Hidden" value={formatNumber(summary.hidden, lang)} tone={summary.hidden > 0 ? "amber" : "default"} />
            </div>
          )}
          <Card>
            <Table
              columns={columns}
              rows={state.data?.data ?? []}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No reviews" description={q || rating || hidden ? "No reviews match the current filters." : "Buyers can review a supplier once an order is delivered."} />}
            />
            {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
          </Card>
        </>
      )}

      <Modal
        open={!!replyTarget}
        title="Reply on behalf of the platform"
        onClose={() => setReplyTarget(null)}
        footer={<><Button variant="outline" onClick={() => setReplyTarget(null)}>{t("common.cancel")}</Button><Button onClick={submitReply} loading={replying}>Post reply</Button></>}
      >
        {replyTarget && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900">{replyTarget.buyer?.name ?? "Buyer"}</span>
                <Stars value={replyTarget.rating} />
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-600">{replyTarget.comment || <span className="italic text-slate-400">No comment</span>}</p>
              <p className="mt-1 text-xs text-slate-500">on {replyTarget.company?.name ?? "supplier"} · {formatDate(replyTarget.createdAt, lang)}</p>
            </div>
            <Textarea label="Reply" name="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Thank you for your feedback…" hint="Shown publicly under the review. Leave empty and post to remove an existing reply." />
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Delete review"
        onClose={() => setDeleteTarget(null)}
        footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={remove} loading={deleting}>{t("common.delete")}</Button></>}
      >
        {deleteTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Permanently delete this {deleteTarget.rating}-star review by <span className="font-medium text-slate-900">{deleteTarget.buyer?.name ?? "the buyer"}</span> of <span className="font-medium text-slate-900">{deleteTarget.company?.name ?? "the supplier"}</span>?</p>
            <p className="text-xs text-slate-500">This cannot be undone. Prefer hiding the review if you may need it later.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
