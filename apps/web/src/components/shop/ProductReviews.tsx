"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductReview, ProductReviewSummary } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { marketplaceApi, type ReviewSort } from "@/lib/api/marketplace";
import { useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, LoadingBlock, Modal, Pagination, Select, Stars, Textarea } from "@/components/ui";

const HELPFUL_KEY = "ms_helpful_reviews";

function readHelpful(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HELPFUL_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function rememberHelpful(id: string) {
  try {
    const set = readHelpful();
    set.add(id);
    window.localStorage.setItem(HELPFUL_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* ignore */
  }
}

/** Average + distribution bars (5 → 1). Clicking a bar is purely visual; the list has its own sort. */
export function RatingSummary({ summary, compact }: { summary: ProductReviewSummary; compact?: boolean }) {
  const total = summary.count || 0;
  return (
    <div className={cn("flex gap-6", compact ? "flex-col" : "flex-col sm:flex-row sm:items-center")}>
      <div className="text-center sm:text-start">
        <p className="text-4xl font-bold tabular-nums text-slate-900">{total ? summary.average.toFixed(1) : "—"}</p>
        <Stars value={summary.average} size="md" className="justify-center sm:justify-start" />
        <p className="mt-1 text-xs text-slate-500">
          {total} {total === 1 ? "review" : "reviews"}
        </p>
      </div>
      <ul className="flex-1 space-y-1.5" aria-label="Rating distribution">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const n = summary.distribution?.[star] ?? 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <li key={star} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-8 shrink-0 tabular-nums">{star}★</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${star} stars: ${n} reviews`}>
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-10 shrink-0 text-end tabular-nums text-slate-400">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewItem({ review, onHelpful, voted }: { review: ProductReview; onHelpful: (id: string) => void; voted: boolean }) {
  const { lang } = useI18n();
  const author = review.user?.name ?? "Buyer";
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={review.rating} />
        {review.title && <h4 className="text-sm font-semibold text-slate-900">{review.title}</h4>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{author}</span>
        {review.user?.companyName ? ` · ${review.user.companyName}` : ""} · {formatDate(review.createdAt, lang)}
        {review.verified && (
          <Badge tone="green" className="ms-2">
            Verified purchase
          </Badge>
        )}
      </p>
      {review.body && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{review.body}</p>}
      {review.supplierReply && (
        <div className="mt-3 rounded-lg border-s-4 border-brand-600 bg-brand-50/60 px-4 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Supplier reply</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{review.supplierReply}</p>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <button type="button" onClick={() => onHelpful(review.id)} disabled={voted} aria-pressed={voted} className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium transition", voted ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
            <path d="M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17h-3.192a3 3 0 01-1.341-.317l-2.734-1.366A3 3 0 006.292 15H5V8h.963c.685 0 1.258-.483 1.612-1.068a4.011 4.011 0 012.166-1.73c.432-.143.853-.386 1.011-.814.16-.432.248-.9.248-1.388z" />
          </svg>
          Helpful{review.helpful > 0 ? ` (${review.helpful})` : ""}
        </button>
        {voted && <span>Thanks for your feedback</span>}
      </div>
    </li>
  );
}

const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "helpful", label: "Most helpful" },
  { value: "rating", label: "Highest rating" },
];

export function ProductReviews({ productId, initialSummary, onSummaryChange }: { productId: string; initialSummary: ProductReviewSummary; onSummaryChange?: (s: ProductReviewSummary) => void }) {
  const { user } = useAuth();
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [page, setPage] = useState(1);
  const [voted, setVoted] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readHelpful()));
  const [writeOpen, setWriteOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const reviews = useAsync(() => marketplaceApi.reviews(productId, { sort, page, pageSize: 10 }), [productId, sort, page]);
  const summary = reviews.data?.summary ?? initialSummary;
  const canReview = user?.role === "BUYER";

  const markHelpful = async (id: string) => {
    if (voted.has(id)) return;
    setVoted((s) => new Set(s).add(id));
    rememberHelpful(id);
    try {
      const res = await marketplaceApi.markHelpful(id);
      reviews.setData((prev) => (prev ? { ...prev, data: prev.data.map((r) => (r.id === id ? { ...r, helpful: res.helpful } : r)) } : prev));
    } catch {
      /* keep the optimistic state */
    }
  };

  const submitReview = async () => {
    if (rating < 1) {
      setFormError("Pick a star rating.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await marketplaceApi.createReview(productId, { rating, title: title.trim() || undefined, body: body.trim() || undefined });
      setWriteOpen(false);
      setPosted(true);
      setRating(0);
      setTitle("");
      setBody("");
      setSort("recent");
      setPage(1);
      reviews.reload();
      const fresh = await marketplaceApi.reviews(productId, { pageSize: 1 }).catch(() => null);
      if (fresh && onSummaryChange) onSummaryChange(fresh.summary);
    } catch (err) {
      setFormError(errorMessage(err, "Could not post your review."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card id="reviews" className="scroll-mt-24">
      <CardHeader
        title={`Customer reviews${summary.count ? ` (${summary.count})` : ""}`}
        subtitle="Only buyers can review; verified badges mark confirmed purchases."
        action={
          canReview ? (
            <Button size="sm" onClick={() => setWriteOpen(true)}>
              Write a review
            </Button>
          ) : !user ? (
            <Link href="/login" className="text-sm font-semibold text-brand-700 hover:underline">
              Sign in to review
            </Link>
          ) : null
        }
      />
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          <RatingSummary summary={summary} compact />
          {posted && (
            <Alert kind="success" className="mt-4">
              Thanks — your review is live.
            </Alert>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-end gap-2">
            <label htmlFor="review-sort" className="text-sm text-slate-500">
              Sort
            </label>
            <Select
              id="review-sort"
              name="review-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as ReviewSort);
                setPage(1);
              }}
              options={REVIEW_SORTS}
              className="w-44"
            />
          </div>
          {reviews.loading && !reviews.data ? (
            <LoadingBlock />
          ) : reviews.error ? (
            <Alert onRetry={reviews.reload}>{reviews.error}</Alert>
          ) : (reviews.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="No reviews yet" description={canReview ? "Bought this product? Be the first to share how it performed." : "Reviews from buyers will appear here."} action={canReview ? <Button variant="outline" onClick={() => setWriteOpen(true)}>Write the first review</Button> : undefined} />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {reviews.data!.data.map((r) => (
                  <ReviewItem key={r.id} review={r} onHelpful={markHelpful} voted={voted.has(r.id)} />
                ))}
              </ul>
              <Pagination page={reviews.data!.page} pageSize={reviews.data!.pageSize} total={reviews.data!.total} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      <Modal
        open={writeOpen}
        title="Write a review"
        onClose={() => setWriteOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWriteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitReview} loading={saving}>
              Post review
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1 block text-sm font-medium text-slate-700">Your rating</p>
            <Stars value={rating} onChange={setRating} size="lg" />
          </div>
          <Input name="review-title" label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Sum it up in a few words" />
          <Textarea name="review-body" label="Review (optional)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="Quality, delivery, packaging, how it performed on site…" />
          {formError && <Alert>{formError}</Alert>}
          <p className="text-xs text-slate-500">One review per product. If you have ordered this product, your review is marked as a verified purchase.</p>
        </div>
      </Modal>
    </Card>
  );
}
