"use client";

import Link from "next/link";
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ProductQuestion, ProductReview, ProductReviewSummary } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { supplierCommerceApi, type SupplierProductWithPricing } from "@/lib/api/supplierCommerce";
import { useAsync, useFlash, type Flash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LinkButton, LoadingBlock, PageHeader, Spinner, Stars, StatTile, Textarea, Toggle } from "@/components/ui";
import { generatedImageUrl } from "@/components/shop/ProductCard";
import { RoleGuard } from "@/components/RoleGuard";

const PAGE_SIZE = 20;
const SCAN_CONCURRENCY = 4;

interface ProductRow {
  materialId: string;
  material: SupplierProductWithPricing["material"];
  image: string;
  cities: string[];
}

interface Engagement {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  reviews: ProductReview[];
  reviewsTotal: number;
  summary: ProductReviewSummary | null;
  questions: ProductQuestion[];
  questionsTotal: number;
}

const EMPTY: Engagement = { loaded: false, loading: false, error: null, reviews: [], reviewsTotal: 0, summary: null, questions: [], questionsTotal: 0 };

const pendingReviews = (e: Engagement) => e.reviews.filter((r) => !r.supplierReply).length;
const pendingQuestions = (e: Engagement) => e.questions.filter((q) => !q.answer).length;

function ProductImage({ src, sku, alt }: { src: string; sku: string; alt: string }) {
  const [current, setCurrent] = useState(src);
  useEffect(() => setCurrent(src), [src]);
  const fallback = generatedImageUrl(sku);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={current} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => current !== fallback && setCurrent(fallback)} />;
}

/** Small inline form used for both review replies and question answers. */
function ReplyBox({ label, placeholder, initial = "", submitLabel, onSubmit, onCancel }: { label: string; placeholder: string; initial?: string; submitLabel: string; onSubmit: (text: string) => Promise<void>; onCancel?: () => void }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (text.trim().length < 2) return;
    setSaving(true);
    try {
      await onSubmit(text.trim());
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <Textarea label={label} name={`reply-${label}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} disabled={saving} className="[&_textarea]:min-h-[72px]" />
      <div className="mt-2 flex justify-end gap-2">
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>}
        <Button size="sm" onClick={submit} loading={saving} disabled={text.trim().length < 2}>{submitLabel}</Button>
      </div>
    </div>
  );
}

function ReviewItem({ review, onReply }: { review: ProductReview; onReply: (id: string, reply: string) => Promise<void> }) {
  const { lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const showForm = !review.supplierReply || editing;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={review.rating} />
        {review.title && <span className="text-sm font-semibold text-slate-900">{review.title}</span>}
        {review.verified && <Badge tone="green">Verified purchase</Badge>}
        {!review.supplierReply && <Badge tone="amber">Needs reply</Badge>}
      </div>
      {review.body && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{review.body}</p>}
      <p className="mt-1 text-xs text-slate-500">
        {review.user?.name ?? "Buyer"}{review.user?.companyName ? ` · ${review.user.companyName}` : ""} · <span title={formatDateTime(review.createdAt, lang)}>{timeAgo(review.createdAt)}</span>
        {review.helpful > 0 && <> · {review.helpful} found this helpful</>}
      </p>
      {review.supplierReply && !editing && (
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your reply</span>
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-brand-700 hover:underline">Edit</button>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{review.supplierReply}</p>
        </div>
      )}
      {showForm && (
        <ReplyBox
          label={review.supplierReply ? "Edit your reply" : "Reply publicly"}
          placeholder="Thank you for your feedback…"
          initial={review.supplierReply ?? ""}
          submitLabel={review.supplierReply ? "Update reply" : "Post reply"}
          onSubmit={async (text) => {
            await onReply(review.id, text);
            setEditing(false);
          }}
          onCancel={review.supplierReply ? () => setEditing(false) : undefined}
        />
      )}
    </li>
  );
}

function QuestionItem({ question, onAnswer }: { question: ProductQuestion; onAnswer: (id: string, answer: string) => Promise<void> }) {
  const { lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const showForm = !question.answer || editing;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">Q</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{question.question}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {question.user?.name ?? "Buyer"}{question.user?.companyName ? ` · ${question.user.companyName}` : ""} · <span title={formatDateTime(question.createdAt, lang)}>{timeAgo(question.createdAt)}</span>
          </p>
        </div>
        {!question.answer && <Badge tone="amber">Unanswered</Badge>}
      </div>
      {question.answer && !editing && (
        <div className="ms-7 mt-2 rounded-xl bg-emerald-50/60 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Answer{question.answeredBy ? ` · ${question.answeredBy.name}` : ""}{question.answeredAt ? ` · ${timeAgo(question.answeredAt)}` : ""}</span>
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-brand-700 hover:underline">Edit</button>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{question.answer}</p>
        </div>
      )}
      {showForm && (
        <div className="ms-7">
          <ReplyBox
            label={question.answer ? "Edit answer" : "Answer"}
            placeholder="Yes – this product is compatible with…"
            initial={question.answer ?? ""}
            submitLabel={question.answer ? "Update answer" : "Post answer"}
            onSubmit={async (text) => {
              await onAnswer(question.id, text);
              setEditing(false);
            }}
            onCancel={question.answer ? () => setEditing(false) : undefined}
          />
        </div>
      )}
    </li>
  );
}

function ProductPanel({ row, engagement, onRetry, onReply, onAnswer, onLoadMoreReviews, onLoadMoreQuestions }: {
  row: ProductRow;
  engagement: Engagement;
  onRetry: () => void;
  onReply: (id: string, reply: string) => Promise<void>;
  onAnswer: (id: string, answer: string) => Promise<void>;
  onLoadMoreReviews: () => Promise<void>;
  onLoadMoreQuestions: () => Promise<void>;
}) {
  const { lang } = useI18n();
  const [moreReviews, setMoreReviews] = useState(false);
  const [moreQuestions, setMoreQuestions] = useState(false);
  if (engagement.loading && !engagement.loaded) return <LoadingBlock label="Loading reviews and questions…" className="py-6" />;
  if (engagement.error) return <Alert onRetry={onRetry} className="m-4">{engagement.error}</Alert>;
  return (
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/40 p-4 lg:grid-cols-2">
      <section>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900">Reviews <span className="font-normal text-slate-500">({formatNumber(engagement.reviewsTotal, lang)})</span></h4>
          {engagement.summary && engagement.summary.count > 0 && <Stars value={engagement.summary.average} count={engagement.summary.count} />}
        </div>
        {engagement.reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">No reviews yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3">
            {engagement.reviews.map((r) => <ReviewItem key={r.id} review={r} onReply={onReply} />)}
          </ul>
        )}
        {engagement.reviews.length < engagement.reviewsTotal && (
          <Button size="sm" variant="ghost" className="mt-2" loading={moreReviews} onClick={async () => { setMoreReviews(true); try { await onLoadMoreReviews(); } finally { setMoreReviews(false); } }}>Load more reviews</Button>
        )}
      </section>
      <section>
        <h4 className="mb-1 text-sm font-semibold text-slate-900">Questions <span className="font-normal text-slate-500">({formatNumber(engagement.questionsTotal, lang)})</span></h4>
        {engagement.questions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">No questions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3">
            {engagement.questions.map((q) => <QuestionItem key={q.id} question={q} onAnswer={onAnswer} />)}
          </ul>
        )}
        {engagement.questions.length < engagement.questionsTotal && (
          <Button size="sm" variant="ghost" className="mt-2" loading={moreQuestions} onClick={async () => { setMoreQuestions(true); try { await onLoadMoreQuestions(); } finally { setMoreQuestions(false); } }}>Load more questions</Button>
        )}
      </section>
    </div>
  );
}

function SupplierReviewsInner() {
  const { lang } = useI18n();
  const products = useAsync(() => supplierCommerceApi.allSupplierProducts(), []);
  const [flash, setFlash] = useFlash(6000);
  const [q, setQ] = useState("");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [engagement, setEngagement] = useState<Record<string, Engagement>>({});
  const [scanning, setScanning] = useState(false);

  // One row per material – a supplier can list the same product in several cities.
  const rows = useMemo<ProductRow[]>(() => {
    const byMaterial = new Map<string, ProductRow>();
    (products.data ?? []).forEach((p) => {
      const existing = byMaterial.get(p.materialId);
      if (existing) {
        if (!existing.cities.includes(p.city)) existing.cities.push(p.city);
        if (p.imageUrl && !existing.image) existing.image = p.displayImageUrl;
        return;
      }
      byMaterial.set(p.materialId, { materialId: p.materialId, material: p.material, image: p.displayImageUrl, cities: [p.city] });
    });
    return [...byMaterial.values()].sort((a, b) => a.material.name.localeCompare(b.material.name));
  }, [products.data]);

  const patch = useCallback((materialId: string, updater: (e: Engagement) => Engagement) => {
    setEngagement((prev) => ({ ...prev, [materialId]: updater(prev[materialId] ?? EMPTY) }));
  }, []);

  const load = useCallback(async (materialId: string) => {
    patch(materialId, (e) => ({ ...e, loading: true, error: null }));
    try {
      const [reviews, questions] = await Promise.all([
        supplierCommerceApi.productReviews(materialId, { pageSize: PAGE_SIZE }),
        supplierCommerceApi.productQuestions(materialId, { pageSize: PAGE_SIZE }),
      ]);
      patch(materialId, (e) => ({ ...e, loaded: true, loading: false, reviews: reviews.data, reviewsTotal: reviews.total, summary: reviews.summary, questions: questions.data, questionsTotal: questions.total }));
    } catch (err) {
      patch(materialId, (e) => ({ ...e, loading: false, error: errorMessage(err) }));
    }
  }, [patch]);

  const toggle = (materialId: string) => {
    const open = !expanded[materialId];
    setExpanded((prev) => ({ ...prev, [materialId]: open }));
    const e = engagement[materialId];
    if (open && !(e?.loaded || e?.loading)) void load(materialId);
  };

  /** Loads every product's reviews & questions (bounded concurrency) so the "needs attention" filter is complete. */
  const scanAll = useCallback(async () => {
    const pending = rows.filter((r) => !(engagement[r.materialId]?.loaded || engagement[r.materialId]?.loading));
    if (!pending.length) return;
    setScanning(true);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++];
        await load(row.materialId);
      }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, pending.length) }, worker));
    setScanning(false);
  }, [rows, engagement, load]);

  const setNeeds = (next: boolean) => {
    setNeedsOnly(next);
    if (next) void scanAll();
  };

  const reply = async (materialId: string, reviewId: string, text: string) => {
    try {
      const updated = await supplierCommerceApi.replyToReview(reviewId, text);
      patch(materialId, (e) => ({ ...e, reviews: e.reviews.map((r) => (r.id === reviewId ? { ...r, ...updated, supplierReply: updated.supplierReply ?? text } : r)) }));
      setFlash({ kind: "success", message: "Reply posted. The reviewer has been notified." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
      throw err;
    }
  };
  const answer = async (materialId: string, questionId: string, text: string) => {
    try {
      const updated = await supplierCommerceApi.answerQuestion(questionId, text);
      patch(materialId, (e) => ({ ...e, questions: e.questions.map((qq) => (qq.id === questionId ? { ...qq, ...updated, answer: updated.answer ?? text } : qq)) }));
      setFlash({ kind: "success", message: "Answer posted. The buyer has been notified." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
      throw err;
    }
  };
  const loadMoreReviews = async (materialId: string) => {
    const e = engagement[materialId] ?? EMPTY;
    const page = Math.floor(e.reviews.length / PAGE_SIZE) + 1;
    try {
      const res = await supplierCommerceApi.productReviews(materialId, { page, pageSize: PAGE_SIZE });
      patch(materialId, (cur) => {
        const seen = new Set(cur.reviews.map((r) => r.id));
        return { ...cur, reviews: [...cur.reviews, ...res.data.filter((r) => !seen.has(r.id))], reviewsTotal: res.total, summary: res.summary };
      });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    }
  };
  const loadMoreQuestions = async (materialId: string) => {
    const e = engagement[materialId] ?? EMPTY;
    const page = Math.floor(e.questions.length / PAGE_SIZE) + 1;
    try {
      const res = await supplierCommerceApi.productQuestions(materialId, { page, pageSize: PAGE_SIZE });
      patch(materialId, (cur) => {
        const seen = new Set(cur.questions.map((qq) => qq.id));
        return { ...cur, questions: [...cur.questions, ...res.data.filter((qq) => !seen.has(qq.id))], questionsTotal: res.total };
      });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    }
  };

  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (needle) {
      const hay = `${r.material.name} ${r.material.nameAr ?? ""} ${r.material.sku} ${r.material.brand ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (needsOnly) {
      const e = engagement[r.materialId];
      if (!e?.loaded) return scanning; // still being scanned: keep it visible until we know
      return pendingReviews(e) + pendingQuestions(e) > 0;
    }
    return true;
  });

  const loadedEntries = Object.values(engagement).filter((e) => e.loaded);
  const totals = {
    reviews: loadedEntries.reduce((s, e) => s + e.reviewsTotal, 0),
    questions: loadedEntries.reduce((s, e) => s + e.questionsTotal, 0),
    pending: loadedEntries.reduce((s, e) => s + pendingReviews(e) + pendingQuestions(e), 0),
  };
  const rated = rows.filter((r) => (r.material.ratingCount ?? 0) > 0);
  const weighted = rated.reduce((s, r) => s + (r.material.ratingAvg ?? 0) * (r.material.ratingCount ?? 0), 0);
  const ratedCount = rated.reduce((s, r) => s + (r.material.ratingCount ?? 0), 0);
  const catalogueAverage = ratedCount > 0 ? weighted / ratedCount : null;
  const onFlash = (f: Flash) => setFlash(f);
  void onFlash;

  return (
    <div>
      <PageHeader
        title="Reviews & questions"
        subtitle="What buyers say and ask about the products you sell. Reply to reviews and answer questions publicly – both appear on the product page and notify the buyer."
        action={<LinkButton href="/supplier/products" variant="outline">← My products</LinkButton>}
      />
      <FlashMessage flash={flash} className="mb-4" />

      {products.loading && !products.data ? <LoadingBlock /> : products.error ? <Alert onRetry={products.reload}>{products.error}</Alert> : rows.length === 0 ? (
        <Card>
          <EmptyState title="No products yet" description="Reviews and questions arrive once you sell products on MySupplier." action={<LinkButton href="/supplier/prices">+ Add product / price</LinkButton>} />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Products" value={formatNumber(rows.length, lang)} sub={`${formatNumber(products.data?.length ?? 0, lang)} offers across cities`} />
            <StatTile label="Catalogue rating" value={catalogueAverage === null ? "—" : <span className="inline-flex items-center gap-2">{catalogueAverage.toFixed(1)}<Stars value={catalogueAverage} size="md" /></span>} sub={ratedCount > 0 ? `${formatNumber(ratedCount, lang)} ratings` : "No ratings yet"} />
            <StatTile label="Reviews · questions" value={loadedEntries.length ? `${formatNumber(totals.reviews, lang)} · ${formatNumber(totals.questions, lang)}` : "—"} sub={loadedEntries.length ? `Across ${formatNumber(loadedEntries.length, lang)} loaded ${loadedEntries.length === 1 ? "product" : "products"}` : "Expand a product to load"} />
            <StatTile label="Needs your reply" value={loadedEntries.length ? formatNumber(totals.pending, lang) : "—"} tone={totals.pending > 0 ? "amber" : "default"} sub="Unanswered reviews and questions" />
          </div>

          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, brand…" aria-label="Search products" className="min-w-[220px] flex-1" />
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <Toggle checked={needsOnly} onChange={setNeeds} label="Only products that need a reply or answer" />
                Needs reply / answer
                {scanning && <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-500"><Spinner size="sm" /> checking products…</span>}
              </label>
            </div>
          </Card>

          <Card className="overflow-hidden">
            {visible.length === 0 ? (
              <EmptyState title={needsOnly ? "Nothing waiting for you" : "No products match"} description={needsOnly ? "Every loaded review has a reply and every question an answer." : "Try a different search."} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {visible.map((row) => {
                  const e = engagement[row.materialId] ?? EMPTY;
                  const open = !!expanded[row.materialId];
                  const name = lang === "ar" ? row.material.nameAr || row.material.name : row.material.name;
                  const ratingAvg = e.summary?.average ?? row.material.ratingAvg ?? null;
                  const ratingCount = e.summary?.count ?? row.material.ratingCount ?? null;
                  const pending = e.loaded ? pendingReviews(e) + pendingQuestions(e) : null;
                  return (
                    <li key={row.materialId}>
                      <button type="button" onClick={() => toggle(row.materialId)} aria-expanded={open} className={cn("grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3 text-start transition hover:bg-slate-50 focus:outline-none focus-visible:bg-brand-50", open && "bg-brand-50/40")}>
                        <span className="block h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><ProductImage src={row.image} sku={row.material.sku} alt={row.material.name} /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
                          <span className="block truncate text-xs text-slate-500">
                            <span className="font-mono">{row.material.sku}</span>{row.material.brand ? ` · ${row.material.brand}` : ""} · {row.cities.join(", ")}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            {ratingCount && ratingAvg !== null ? <Stars value={ratingAvg} count={ratingCount} /> : <span className="text-xs text-slate-400">No ratings yet</span>}
                            {e.loaded && <Badge tone="slate">{formatNumber(e.reviewsTotal, lang)} reviews · {formatNumber(e.questionsTotal, lang)} questions</Badge>}
                            {pending !== null && pending > 0 && <Badge tone="amber">{pending} need{pending === 1 ? "s" : ""} reply</Badge>}
                            {pending === 0 && e.loaded && (e.reviewsTotal > 0 || e.questionsTotal > 0) && <Badge tone="green">All answered</Badge>}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {e.loading && <Spinner size="sm" />}
                          <Link href={`/shop/products/${row.materialId}`} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="hidden text-xs font-medium text-brand-700 hover:underline sm:inline">View ↗</Link>
                          <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-5 w-5 text-slate-400 transition", open && "rotate-180")} aria-hidden><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                        </span>
                      </button>
                      {open && (
                        <ProductPanel
                          row={row}
                          engagement={e}
                          onRetry={() => void load(row.materialId)}
                          onReply={(id, text) => reply(row.materialId, id, text)}
                          onAnswer={(id, text) => answer(row.materialId, id, text)}
                          onLoadMoreReviews={() => loadMoreReviews(row.materialId)}
                          onLoadMoreQuestions={() => loadMoreQuestions(row.materialId)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function SupplierReviewsPage() {
  return (
    <RoleGuard area="sell">
      <Suspense fallback={<LoadingBlock />}>
        <SupplierReviewsInner />
      </Suspense>
    </RoleGuard>
  );
}
