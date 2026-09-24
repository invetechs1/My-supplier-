"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { AnnouncementPayload, AuditLogEntry } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, Textarea, Toggle, type Column } from "@/components/ui";

type Audience = AnnouncementPayload["audience"];

const AUDIENCES: Array<{ value: Audience; label: string }> = [
  { value: "ALL", label: "Everyone" },
  { value: "BUYERS", label: "Buyers" },
  { value: "SUPPLIERS", label: "Suppliers" },
];

const AUDIENCE_TONE: Record<Audience, "blue" | "green" | "purple"> = {
  ALL: "purple",
  BUYERS: "blue",
  SUPPLIERS: "green",
};

const TITLE_MAX = 120;
const BODY_MAX = 2000;
const BODY_PREVIEW = 140;

function audienceLabel(v: unknown): string {
  return AUDIENCES.find((a) => a.value === v)?.label ?? String(v ?? "—");
}

function isAudience(v: unknown): v is Audience {
  return v === "ALL" || v === "BUYERS" || v === "SUPPLIERS";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

function ExpandableBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="text-slate-400">—</span>;
  const long = text.length > BODY_PREVIEW;
  return (
    <div className="max-w-md">
      <p className={`whitespace-pre-line text-slate-700 ${open ? "" : "line-clamp-2"}`}>{open || !long ? text : `${text.slice(0, BODY_PREVIEW)}…`}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-medium text-brand-700 hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const history = useAsync(() => api.adminAnnouncements({ page }), [page]);
  const [flash, setFlash] = useFlash(8000);

  const [form, setForm] = useState<{ title: string; body: string; audience: Audience; link: string; email: boolean }>({ title: "", body: "", audience: "ALL", link: "", email: false });
  const [errors, setErrors] = useState<{ title?: string; body?: string; link?: string }>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (form.title.trim().length < 3) next.title = "Title must be at least 3 characters.";
    else if (form.title.trim().length > TITLE_MAX) next.title = `Keep the title under ${TITLE_MAX} characters.`;
    if (form.body.trim().length < 10) next.body = "Message must be at least 10 characters.";
    else if (form.body.trim().length > BODY_MAX) next.body = `Keep the message under ${BODY_MAX} characters.`;
    const link = form.link.trim();
    if (link && !/^(\/|https?:\/\/)/i.test(link)) next.link = "Use a path like /shop or a full https:// URL.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) setConfirmOpen(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const payload: AnnouncementPayload = {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        link: form.link.trim() || null,
        email: form.email,
      };
      const res = await api.adminSendAnnouncement(payload);
      setFlash({ kind: "success", message: `Sent to ${formatNumber(res.recipients, lang)} recipient${res.recipients === 1 ? "" : "s"}${form.email ? " (in-app and by email)" : ""}.` });
      setConfirmOpen(false);
      setForm({ title: "", body: "", audience: "ALL", link: "", email: false });
      setErrors({});
      setPage(1);
      history.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  const columns: Column<AuditLogEntry>[] = [
    { key: "date", header: "Date", render: (a) => <span className="whitespace-nowrap text-slate-500">{formatDateTime(a.createdAt, lang)}</span> },
    {
      key: "title",
      header: "Title",
      render: (a) => {
        const link = str(a.meta?.link);
        return (
          <div className="min-w-0 max-w-xs">
            <div className="truncate font-medium text-slate-900">{str(a.meta?.title) || "—"}</div>
            {link && <Link href={link} className="block truncate text-xs text-brand-700 hover:underline" dir="ltr">{link}</Link>}
          </div>
        );
      },
    },
    { key: "body", header: "Message", render: (a) => <ExpandableBody text={str(a.meta?.body)} /> },
    {
      key: "audience",
      header: "Audience",
      render: (a) => {
        const aud = a.meta?.audience;
        return <Badge tone={isAudience(aud) ? AUDIENCE_TONE[aud] : "slate"}>{audienceLabel(aud)}</Badge>;
      },
    },
    {
      key: "recipients",
      header: "Recipients",
      align: "end",
      render: (a) => {
        const n = num(a.meta?.recipients);
        return (
          <div>
            <div className="font-semibold tabular-nums text-slate-900">{n === null ? "—" : formatNumber(n, lang)}</div>
            {a.meta?.email === true && <div className="text-xs text-slate-500">+ email</div>}
          </div>
        );
      },
    },
    { key: "actor", header: "Sent by", render: (a) => a.actor ? <span title={a.actor.email} className="text-slate-700">{a.actor.name}</span> : <span className="italic text-slate-400">system</span> },
  ];

  const rows = history.data?.data ?? [];
  const audienceText = AUDIENCES.find((a) => a.value === form.audience)?.label ?? form.audience;

  return (
    <div>
      <PageHeader title={t("admin.announcements")} subtitle="Broadcast a notification to every buyer, every supplier, or everyone on the platform." />
      <FlashMessage flash={flash} className="mb-4" />

      <Card>
        <CardHeader title="New announcement" subtitle="Delivered as an in-app notification; optionally also by email." />
        <form onSubmit={review} noValidate>
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Input label="Title" name="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Ramadan delivery schedule" maxLength={TITLE_MAX} error={errors.title} required className="md:col-span-2" />
              <Select label="Audience" name="audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as Audience })} options={AUDIENCES} required />
            </div>
            <Textarea
              label="Message"
              name="body"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Keep it short and actionable. Plain text; line breaks are preserved."
              rows={5}
              maxLength={BODY_MAX}
              error={errors.body}
              hint={`${form.body.length}/${BODY_MAX} characters`}
              required
            />
            <div className="grid gap-4 md:grid-cols-3">
              <Input label="Link (optional)" name="link" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="/shop" dir="ltr" error={errors.link} hint="Where the notification takes the user when tapped." className="md:col-span-2" />
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700">Also send by email</span>
                <label className="flex h-10 items-center gap-3 text-sm text-slate-600">
                  <Toggle checked={form.email} onChange={(v) => setForm({ ...form, email: v })} label="Also send by email" />
                  {form.email ? "In-app + email" : "In-app only"}
                </label>
              </div>
            </div>
          </CardBody>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            <p className="text-xs text-slate-500">Announcements cannot be recalled once sent. Every send is recorded in the audit log.</p>
            <Button type="submit" variant="accent">Review & send</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent announcements" subtitle="Newest first" />
        {history.loading && !history.data ? <LoadingBlock /> : history.error ? <CardBody><Alert onRetry={history.reload}>{history.error}</Alert></CardBody> : (
          <>
            <Table columns={columns} rows={rows} rowKey={(a) => a.id} empty={<EmptyState title="Nothing sent yet" description="Announcements you send from the form above will be listed here with their audience and reach." />} />
            {history.data && <Pagination page={history.data.page} pageSize={history.data.pageSize} total={history.data.total} onChange={setPage} />}
          </>
        )}
      </Card>

      <Modal
        open={confirmOpen}
        title="Send this announcement?"
        onClose={() => (sending ? undefined : setConfirmOpen(false))}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={send} loading={sending}>Send to {audienceText.toLowerCase()}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert kind="warning">
            This notifies <span className="font-semibold">{audienceText.toLowerCase()}</span> on the platform{form.email ? ", in-app and by email" : ""}. It cannot be undone.
          </Alert>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Badge tone={AUDIENCE_TONE[form.audience]}>{audienceText}</Badge>
              {form.email && <Badge tone="slate">Email</Badge>}
            </div>
            <h4 className="text-sm font-semibold text-slate-900">{form.title.trim()}</h4>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{form.body.trim()}</p>
            {form.link.trim() && <p className="mt-2 truncate text-xs text-brand-700" dir="ltr">{form.link.trim()}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
