"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductQuestion } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { marketplaceApi } from "@/lib/api/marketplace";
import { useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, Pagination, Textarea } from "@/components/ui";

function QuestionItem({ q }: { q: ProductQuestion }) {
  const { t, lang } = useI18n();
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600" aria-hidden>
          Q
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{q.question}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {q.user?.name ?? t("reviews.buyer")} · {formatDate(q.createdAt, lang)}
          </p>
        </div>
      </div>
      {q.answer ? (
        <div className="mt-3 flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700" aria-hidden>
            A
          </span>
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-line text-sm text-slate-700">{q.answer}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {q.answeredBy?.companyName ?? q.answeredBy?.name ?? t("product.supplier")}
              {q.answeredAt ? ` · ${formatDate(q.answeredAt, lang)}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <p className="ms-9 mt-2 text-xs text-slate-400">
          <Badge tone="amber">{t("questions.awaiting")}</Badge>
        </p>
      )}
    </li>
  );
}

export function ProductQuestions({ productId, initialCount }: { productId: string; initialCount: number }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const questions = useAsync(() => marketplaceApi.questions(productId, { page, pageSize: 10 }), [productId, page]);
  const total = questions.data?.total ?? initialCount;

  const ask = async () => {
    const question = text.trim();
    if (question.length < 5) {
      setError(t("questions.tooShort"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await marketplaceApi.askQuestion(productId, question);
      setText("");
      setSent(true);
      questions.setData((prev) => (prev ? { ...prev, total: prev.total + 1, data: [created, ...prev.data] } : prev));
    } catch (err) {
      setError(errorMessage(err, t("questions.couldNotPost")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card id="questions" className="scroll-mt-24">
      <CardHeader title={`${t("questions.title")}${total ? ` (${total})` : ""}`} subtitle={t("questions.subtitle")} />
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {questions.loading && !questions.data ? (
            <LoadingBlock />
          ) : questions.error ? (
            <Alert onRetry={questions.reload}>{questions.error}</Alert>
          ) : (questions.data?.data.length ?? 0) === 0 ? (
            <EmptyState title={t("questions.none")} description={t("questions.noneDesc")} />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {questions.data!.data.map((q) => (
                  <QuestionItem key={q.id} q={q} />
                ))}
              </ul>
              <Pagination page={questions.data!.page} pageSize={questions.data!.pageSize} total={questions.data!.total} onChange={setPage} />
            </>
          )}
        </div>
        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">{t("questions.have")}</h4>
          {user ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <Textarea name="question" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t("questions.placeholder")} aria-label={t("questions.yourQuestion")} />
              {error && <Alert>{error}</Alert>}
              {sent && !error && <Alert kind="success">{t("questions.posted")}</Alert>}
              <Button type="submit" size="sm" loading={saving} disabled={text.trim().length < 5}>
                {t("questions.ask")}
              </Button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              <Link href="/login" className="font-semibold text-brand-700 hover:underline">
                {t("questions.signIn")}
              </Link>{" "}
              {t("questions.toAsk")}
            </p>
          )}
        </aside>
      </div>
    </Card>
  );
}
