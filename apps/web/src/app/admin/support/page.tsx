"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ContactMessage, ContactStatus } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Pagination, Select, StatTile, Textarea } from "@/components/ui";

const STATUS_LABEL: Record<ContactStatus, string> = { NEW: "New", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };
const STATUS_TONE: Record<ContactStatus, "amber" | "blue" | "green"> = { NEW: "amber", IN_PROGRESS: "blue", RESOLVED: "green" };
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ContactStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }));

export default function AdminSupportPage() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<ContactStatus | "">("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.adminContactMessages({ status, q: q || undefined, page }), [status, q, page]);
  const [flash, setFlash] = useFlash();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<ContactStatus>("NEW");
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const messages = useMemo(() => state.data?.data ?? [], [state.data]);
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  // Keep the selection valid when the page of results changes, and reset the draft when a different message is picked.
  useEffect(() => {
    if (!messages.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !messages.some((m) => m.id === selectedId)) setSelectedId(messages[0].id);
  }, [messages, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraftStatus(selected.status);
    setDraftNotes(selected.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const patchRow = (updated: ContactMessage) => {
    state.setData((prev) => {
      if (!prev) return prev;
      const before = prev.data.find((m) => m.id === updated.id);
      const summary = { ...prev.summary };
      if (before && before.status !== updated.status) {
        summary[before.status] = Math.max(0, (summary[before.status] ?? 0) - 1);
        summary[updated.status] = (summary[updated.status] ?? 0) + 1;
      }
      return { ...prev, summary, data: prev.data.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)) };
    });
  };

  const persist = async (m: ContactMessage, body: { status?: ContactStatus; notes?: string | null }, successMessage: string) => {
    setSaving(true);
    try {
      const updated = await api.adminUpdateContactMessage(m.id, body);
      patchRow(updated);
      setDraftStatus(updated.status);
      setDraftNotes(updated.notes ?? "");
      setFlash({ kind: "success", message: successMessage });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!selected) return;
    void persist(selected, { status: draftStatus, notes: draftNotes.trim() || null }, "Message updated.");
  };
  const quickStatus = (next: ContactStatus) => {
    if (!selected) return;
    void persist(selected, { status: next, notes: draftNotes.trim() || null }, `Marked ${STATUS_LABEL[next].toLowerCase()}.`);
  };

  const summary = state.data?.summary;
  const dirty = !!selected && (draftStatus !== selected.status || draftNotes.trim() !== (selected.notes ?? "").trim());

  return (
    <div>
      <PageHeader title={t("admin.support")} subtitle="Messages sent through the contact form. Pick a message to read it, keep internal notes and track it from new to resolved." />
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, subject or message…" />
          <Select name="status" value={status} onChange={(e) => { setStatus(e.target.value as ContactStatus | ""); setPage(1); }} placeholder="All statuses" options={STATUS_OPTIONS} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <>
          {summary && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <StatTile label="New" value={formatNumber(summary.NEW ?? 0, lang)} tone={(summary.NEW ?? 0) > 0 ? "amber" : "default"} sub="Awaiting a first response" />
              <StatTile label="In progress" value={formatNumber(summary.IN_PROGRESS ?? 0, lang)} />
              <StatTile label="Resolved" value={formatNumber(summary.RESOLVED ?? 0, lang)} />
            </div>
          )}
          {messages.length === 0 ? (
            <Card>
              <EmptyState title="No messages" description={q || status ? "No messages match the current filters." : "Messages sent through the contact form will appear here."} />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
              <Card className="overflow-hidden">
                <ul className="divide-y divide-slate-100">
                  {messages.map((m) => {
                    const active = m.id === selectedId;
                    const unread = m.status === "NEW";
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(m.id)}
                          aria-current={active ? "true" : undefined}
                          className={cn(
                            "block w-full px-4 py-3 text-start transition hover:bg-slate-50 focus:outline-none focus-visible:bg-brand-50",
                            active && "bg-brand-50/60 border-s-2 border-brand-600",
                            unread && "bg-amber-50/30",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("truncate text-sm", unread ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>{m.name}</span>
                            <span className="shrink-0 text-xs text-slate-500" title={formatDateTime(m.createdAt, lang)}>{timeAgo(m.createdAt)}</span>
                          </div>
                          <p className={cn("mt-0.5 truncate text-sm", unread ? "font-medium text-slate-800" : "text-slate-600")}>{m.subject}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                            {unread && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Unread" />}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
              </Card>

              {selected ? (
                <Card>
                  <CardHeader
                    title={selected.subject}
                    subtitle={<>Received {formatDateTime(selected.createdAt, lang)}{selected.resolvedAt ? ` · Resolved ${formatDateTime(selected.resolvedAt, lang)}` : ""}</>}
                    action={<Badge tone={STATUS_TONE[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>}
                  />
                  <CardBody className="space-y-5">
                    <dl className="grid gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">From</dt>
                        <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium text-slate-900">
                          {selected.name}
                          {selected.user && <Badge tone={selected.user.role === "SUPPLIER" ? "green" : selected.user.role === "ADMIN" ? "purple" : "blue"} title={`Linked account: ${selected.user.name}`}>{selected.user.role} account</Badge>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                        <dd className="mt-0.5"><a href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`} className="font-medium text-brand-700 hover:underline" dir="ltr">{selected.email}</a></dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt>
                        <dd className="mt-0.5 text-slate-900" dir="ltr">{selected.phone ? <a href={`tel:${selected.phone}`} className="hover:underline">{selected.phone}</a> : <span className="text-slate-400">—</span>}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Message ID</dt>
                        <dd className="mt-0.5 font-mono text-xs text-slate-500" dir="ltr">{selected.id}</dd>
                      </div>
                    </dl>

                    <div>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Message</h4>
                      <p className="whitespace-pre-wrap rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed text-slate-800">{selected.message}</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                      <Textarea label="Internal notes" name="notes" value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={4} placeholder="Only visible to admins…" hint="Not shown to the sender." />
                      <Select label={t("common.status")} name="draftStatus" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as ContactStatus)} options={STATUS_OPTIONS} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap gap-2">
                        {selected.status !== "IN_PROGRESS" && <Button size="sm" variant="secondary" onClick={() => quickStatus("IN_PROGRESS")} disabled={saving}>Mark in progress</Button>}
                        {selected.status !== "RESOLVED" && <Button size="sm" variant="secondary" onClick={() => quickStatus("RESOLVED")} disabled={saving}>Mark resolved</Button>}
                      </div>
                      <Button onClick={save} loading={saving} disabled={!dirty}>{t("common.save")}</Button>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <Card>
                  <EmptyState title="Select a message" description="Pick a message from the list to read it." />
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
