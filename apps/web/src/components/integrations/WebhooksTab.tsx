"use client";

import React, { useEffect, useState } from "react";
import type { WebhookDelivery, WebhookDeliveryStatus, WebhookEvent } from "@mysupplier/shared";
import { WEBHOOK_EVENTS } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { integrationsApi, type WebhookDeliveryResult, type WebhookEndpointCreated, type WebhookEndpointWithStats } from "@/lib/api/integrations";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, Modal, Pagination, Select, Table, Textarea, Toggle, type Column } from "@/components/ui";
import { CodeBlock, CopyButton, DEFAULT_EVENTS, DeliveryStatusBadge, EVENT_META, EventChips, Mono, relevantTo, type Perspective } from "./shared";

type EventSelection = Array<WebhookEvent | "*">;

interface EndpointForm {
  url: string;
  events: EventSelection;
  description: string;
}

const PAGE_SIZE = 20;

type Translate = (key: TranslationKey) => string;

function describeResult(result: WebhookDeliveryResult, kind: "test" | "retry", t: Translate): { kind: "success" | "error"; message: string } {
  const code = result.delivery.responseCode;
  const http = code ? ` (HTTP ${code})` : ` (${t("integrations.noResponse")})`;
  const subject = kind === "test" ? t("integrations.testPing") : t("integrations.delivery");
  if (result.ok) return { kind: "success", message: `${subject} ${t("integrations.delivered")}${http}.` };
  const tail = result.outcome === "retried" ? t("integrations.retryScheduled") : t("integrations.markedFailed");
  return { kind: "error", message: `${subject} ${t("integrations.notAccepted")}${http}. ${tail}` };
}

export function WebhooksTab({ perspective }: { perspective: Perspective }) {
  const { t, lang } = useI18n();
  const state = useAsync(() => integrationsApi.webhooks(), []);
  const [flash, setFlash] = useFlash(8000);

  const [modal, setModal] = useState<{ open: boolean; editing: WebhookEndpointWithStats | null }>({ open: false, editing: null });
  const [form, setForm] = useState<EndpointForm>({ url: "", events: DEFAULT_EVENTS[perspective], description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<WebhookEndpointCreated | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpointWithStats | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<WebhookEndpointWithStats | null>(null);

  const rows = state.data ?? [];

  const openCreate = () => {
    setForm({ url: "", events: DEFAULT_EVENTS[perspective], description: "" });
    setErrors({});
    setModal({ open: true, editing: null });
  };
  const openEdit = (e: WebhookEndpointWithStats) => {
    setForm({ url: e.url, events: e.events, description: e.description ?? "" });
    setErrors({});
    setModal({ open: true, editing: e });
  };
  const closeModal = () => setModal({ open: false, editing: null });

  const allEvents = form.events.includes("*");
  const toggleAll = (on: boolean) => setForm((f) => ({ ...f, events: on ? ["*"] : DEFAULT_EVENTS[perspective] }));
  const toggleEvent = (ev: WebhookEvent) =>
    setForm((f) => {
      const without = f.events.filter((x) => x !== "*");
      return { ...f, events: without.includes(ev) ? without.filter((x) => x !== ev) : [...without, ev] };
    });

  const save = async () => {
    const next: Record<string, string> = {};
    const url = form.url.trim();
    if (!url) next.url = t("integrations.errUrl");
    else {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") next.url = t("integrations.errHttps");
      } catch {
        next.url = t("integrations.errUrlInvalid");
      }
    }
    if (form.events.length === 0) next.events = t("integrations.errEvents");
    if (form.description.length > 200) next.description = t("integrations.errDescLong");
    setErrors(next);
    if (Object.keys(next).length) return;

    const events: EventSelection = allEvents ? ["*"] : WEBHOOK_EVENTS.filter((e) => form.events.includes(e));
    const description = form.description.trim() || null;
    setSaving(true);
    try {
      if (modal.editing) {
        const updated = await integrationsApi.updateWebhook(modal.editing.id, { url, events, description });
        state.setData((prev) => (prev ? prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)) : prev));
        setFlash({ kind: "success", message: t("integrations.endpointUpdated") });
        closeModal();
      } else {
        const result = await integrationsApi.createWebhook({ url, events, description });
        state.setData((prev) => [{ ...result.endpoint, deliveries: { PENDING: 0, SUCCESS: 0, FAILED: 0 } }, ...(prev ?? [])]);
        closeModal();
        setCreated(result);
      }
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (e: WebhookEndpointWithStats, active: boolean) => {
    setBusy(e.id);
    state.setData((prev) => (prev ? prev.map((x) => (x.id === e.id ? { ...x, active } : x)) : prev));
    try {
      const updated = await integrationsApi.updateWebhook(e.id, { active });
      state.setData((prev) => (prev ? prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)) : prev));
      setFlash({ kind: "success", message: active ? t("integrations.endpointActivated") : t("integrations.endpointPaused") });
    } catch (err) {
      state.setData((prev) => (prev ? prev.map((x) => (x.id === e.id ? { ...x, active: !active } : x)) : prev));
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async (e: WebhookEndpointWithStats) => {
    setBusy(e.id);
    try {
      const result = await integrationsApi.testWebhook(e.id);
      setFlash(describeResult(result, "test", t));
      const key = result.delivery.status;
      state.setData((prev) => (prev ? prev.map((x) => (x.id === e.id ? { ...x, deliveries: { PENDING: 0, SUCCESS: 0, FAILED: 0, ...(x.deliveries ?? {}), [key]: (x.deliveries?.[key] ?? 0) + 1 } } : x)) : prev));
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await integrationsApi.deleteWebhook(deleteTarget.id);
      state.setData((prev) => (prev ? prev.filter((x) => x.id !== deleteTarget.id) : prev));
      setFlash({ kind: "success", message: t("integrations.endpointDeleted") });
      setDeleteTarget(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<WebhookEndpointWithStats>[] = [
    { key: "url", header: t("integrations.endpoint"), render: (e) => (
      <div className="min-w-[220px] max-w-[360px]">
        <p dir="ltr" className="truncate font-mono text-xs text-slate-900 text-start" title={e.url}>{e.url}</p>
        {e.description && <p className="truncate text-xs text-slate-500" title={e.description}>{e.description}</p>}
      </div>
    ) },
    { key: "events", header: t("integrations.events"), render: (e) => <EventChips events={e.events} /> },
    { key: "deliveries", header: t("integrations.deliveries"), render: (e) => {
      const d = e.deliveries ?? { PENDING: 0, SUCCESS: 0, FAILED: 0 };
      return (
        <button type="button" onClick={() => setDrawer(e)} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums hover:underline" title={t("integrations.openLog")}>
          <span className="text-emerald-700">{d.SUCCESS} {t("integrations.ok")}</span>
          <span className="text-slate-300">·</span>
          <span className={d.FAILED > 0 ? "font-semibold text-red-600" : "text-slate-500"}>{d.FAILED} {t("integrations.failedLower")}</span>
          {d.PENDING > 0 && <><span className="text-slate-300">·</span><span className="text-amber-700">{d.PENDING} {t("integrations.pendingLower")}</span></>}
        </button>
      );
    } },
    { key: "active", header: t("integrations.active"), render: (e) => (
      <span className="inline-flex items-center gap-2">
        <Toggle checked={e.active} onChange={(v) => toggleActive(e, v)} disabled={busy === e.id} label={`${t("integrations.endpointActive")}: ${e.url}`} />
        <span className={`text-xs ${e.active ? "text-emerald-700" : "text-slate-500"}`}>{e.active ? t("integrations.active") : t("integrations.paused")}</span>
      </span>
    ) },
    { key: "created", header: t("orders.created"), render: (e) => <span className="whitespace-nowrap text-slate-500" title={formatDateTime(e.createdAt, lang)}>{formatDate(e.createdAt, lang)}</span> },
    { key: "actions", header: "", align: "end", render: (e) => (
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => sendTest(e)} loading={busy === e.id}>{t("integrations.sendTest")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setDrawer(e)}>{t("integrations.deliveries")}</Button>
        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>{t("common.edit")}</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(e)}>{t("common.delete")}</Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <FlashMessage flash={flash} />
      <Card>
        <CardHeader
          title={t("integrations.webhookEndpoints")}
          subtitle={t("integrations.webhooksSubtitle")}
          action={<Button variant="accent" onClick={openCreate}>{t("integrations.addEndpointPlus")}</Button>}
        />
        {state.loading ? <LoadingBlock /> : state.error ? <div className="p-5"><Alert onRetry={state.reload}>{state.error}</Alert></div> : (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            empty={<EmptyState title={t("integrations.noEndpoints")} description={perspective === "supplier" ? t("integrations.noEndpointsSupplier") : t("integrations.noEndpointsBuyer")} action={<Button onClick={openCreate}>{t("integrations.addFirstEndpoint")}</Button>} />}
          />
        )}
      </Card>

      {/* ---------------------------------------------------------------- create / edit */}
      <Modal
        open={modal.open}
        wide
        title={modal.editing ? t("integrations.editEndpoint") : t("integrations.addWebhookEndpoint")}
        onClose={closeModal}
        footer={<><Button variant="outline" onClick={closeModal}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{modal.editing ? t("reviews.saveChanges") : t("integrations.addEndpoint")}</Button></>}
      >
        <div className="space-y-5">
          {errors.form && <Alert>{errors.form}</Alert>}
          <Input label={t("integrations.endpointUrl")} name="webhookUrl" type="url" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} error={errors.url} required placeholder="https://erp.example.com/hooks/mysupplier" hint={t("integrations.endpointUrlHint")} className="font-mono" />
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">{t("integrations.events")} <span className="text-red-500">*</span></p>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" checked={allEvents} onChange={(e) => toggleAll(e.target.checked)} />
                {t("integrations.allEvents")} (<span dir="ltr" className="font-mono">*</span>){t("integrations.includingFuture")}
              </label>
            </div>
            {errors.events && <Alert className="mb-2">{errors.events}</Alert>}
            <div className={`grid gap-1.5 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 ${allEvents ? "opacity-60" : ""}`}>
              {WEBHOOK_EVENTS.map((ev) => {
                const meta = EVENT_META[ev];
                const relevant = relevantTo(meta.audience, perspective);
                return (
                  <label key={ev} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-50">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" disabled={allEvents} checked={allEvents || form.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span dir="ltr" className="font-mono text-xs font-semibold text-slate-800">{ev}</span>
                        {!relevant && <Badge tone="slate">{meta.audience === "supplier" ? t("integrations.supplierOnly") : t("integrations.buyerOnly")}</Badge>}
                      </span>
                      <span className="block text-xs text-slate-500">{t(meta.descriptionKey)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <Textarea label={t("integrations.descriptionOptional")} name="webhookDescription" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={errors.description} placeholder={t("integrations.descriptionPlaceholder")} maxLength={200} />
          {!modal.editing && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{t("integrations.secretShownOnce1")} <strong>{t("integrations.once")}</strong> {t("integrations.secretShownOnce2")} <Mono>X-MySupplier-Signature</Mono> {t("integrations.onEveryDelivery")}</p>}
        </div>
      </Modal>

      {/* ---------------------------------------------------------------- one-time secret */}
      <Modal open={!!created} wide title={t("integrations.endpointCreated")} onClose={() => setCreated(null)} footer={<Button onClick={() => setCreated(null)}>{t("integrations.storedSecret")}</Button>}>
        {created && (
          <div className="space-y-4">
            <Alert kind="warning">
              <p className="font-semibold">{t("integrations.copySecretNow")}</p>
              <p className="mt-1">{created.warning ?? t("integrations.secretLoseNote")}</p>
            </Alert>
            <div>
              <p dir="ltr" className="mb-1 truncate font-mono text-xs text-slate-600 text-start">{created.endpoint.url}</p>
              <div dir="ltr" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <code className="min-w-0 flex-1 select-all break-all font-mono text-sm text-emerald-900">{created.secret}</code>
                <CopyButton text={created.secret} label={t("integrations.copySecret")} />
              </div>
            </div>
            <div className="text-xs text-slate-600">
              <p className="mb-1 font-medium text-slate-700">{t("integrations.everyDeliveryCarries")}</p>
              <CodeBlock title="headers" compact code={`X-MySupplier-Event: order.created\nX-MySupplier-Delivery: dlv_01HZX…          # unique per delivery – de-duplicate on it\nX-MySupplier-Timestamp: 1790326500          # unix seconds\nX-MySupplier-Signature: sha256=3f1a…        # HMAC-SHA256(secret, timestamp + "." + rawBody)`} />
              <p className="mt-2">{t("integrations.verifySamples1")} <strong>{t("integrations.devGuide")}</strong>{t("integrations.verifySamples2")} <strong>{t("integrations.sendTest")}</strong> {t("integrations.verifySamples3")} <Mono>ping</Mono> {t("integrations.verifySamples4")}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------------------------------------------------------- delete */}
      <Modal
        open={!!deleteTarget}
        title={t("integrations.deleteEndpoint")}
        onClose={() => setDeleteTarget(null)}
        footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={remove} loading={deleting}>{t("common.delete")}</Button></>}
      >
        {deleteTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>{t("common.delete")} <span dir="ltr" className="font-mono text-xs text-slate-900">{deleteTarget.url}</span>{t("integrations.qm")}</p>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("integrations.deleteWarning")}</p>
          </div>
        )}
      </Modal>

      {drawer && <DeliveriesDrawer endpoint={drawer} onClose={() => setDrawer(null)} onResult={(r) => setFlash(describeResult(r, "retry", t))} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deliveries drawer
// ---------------------------------------------------------------------------
function DeliveriesDrawer({ endpoint, onClose, onResult }: { endpoint: WebhookEndpointWithStats; onClose: () => void; onResult: (r: WebhookDeliveryResult) => void }) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<WebhookDeliveryStatus | "">("");
  const [event, setEvent] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useAsync(() => integrationsApi.deliveries(endpoint.id, { status, event, page, pageSize: PAGE_SIZE }), [endpoint.id, status, event, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const retry = async (d: WebhookDelivery) => {
    setRetrying(d.id);
    setError(null);
    try {
      const result = await integrationsApi.retryDelivery(d.id);
      state.setData((prev) => (prev ? { ...prev, data: prev.data.map((x) => (x.id === result.delivery.id ? result.delivery : x)) } : prev));
      onResult(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRetrying(null);
    }
  };

  const deliveries = state.data?.data ?? [];
  const eventOptions = WEBHOOK_EVENTS.map((e) => ({ value: e, label: e }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("integrations.webhookDeliveries")}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{t("integrations.deliveries")}</h3>
            <p dir="ltr" className="truncate font-mono text-xs text-slate-500 text-start" title={endpoint.url}>{endpoint.url}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("integrations.close")} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Select name="deliveryStatus" value={status} onChange={(e) => { setStatus(e.target.value as WebhookDeliveryStatus | ""); setPage(1); }} placeholder={t("orders.allStatuses")} options={[{ value: "PENDING", label: t("integrations.dsPending") }, { value: "SUCCESS", label: t("integrations.dsSuccess") }, { value: "FAILED", label: t("integrations.dsFailed") }]} className="w-40" aria-label={t("integrations.filterByStatus")} />
          <Select name="deliveryEvent" value={event} onChange={(e) => { setEvent(e.target.value); setPage(1); }} placeholder={t("integrations.allEvents")} options={eventOptions} className="w-52" aria-label={t("integrations.filterByEvent")} />
          <Button size="sm" variant="ghost" onClick={state.reload} className="ms-auto">{t("common.refresh")}</Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <Alert className="mb-3">{error}</Alert>}
          {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : deliveries.length === 0 ? (
            <EmptyState title={t("integrations.noDeliveries")} description={t("integrations.noDeliveriesDesc")} />
          ) : (
            <ul className="space-y-3">
              {deliveries.map((d) => {
                const open = expanded === d.id;
                return (
                  <li key={d.id} className="rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                      <span dir="ltr" className="font-mono text-xs font-semibold text-slate-800">{d.event}</span>
                      <DeliveryStatusBadge status={d.status} />
                      <span className="text-xs text-slate-500 tabular-nums">{d.attempts} {d.attempts === 1 ? t("integrations.attemptOne") : t("integrations.attemptMany")}</span>
                      <span className="text-xs text-slate-500 tabular-nums">HTTP {d.responseCode ?? "—"}</span>
                      <span className="ms-auto flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : d.id)} aria-expanded={open}>{open ? t("integrations.hide") : t("integrations.details")}</Button>
                        <Button size="sm" variant="outline" onClick={() => retry(d)} loading={retrying === d.id}>{d.status === "SUCCESS" ? t("integrations.resend") : t("common.retry")}</Button>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                      <span title={formatDateTime(d.createdAt, lang)}>{t("orders.created")} {timeAgo(d.createdAt)}</span>
                      <span>{t("integrations.deliveredAt")} {d.deliveredAt ? formatDateTime(d.deliveredAt, lang) : "—"}</span>
                      {d.nextAttemptAt && d.status === "PENDING" && <span>{t("integrations.nextAttempt")} {formatDateTime(d.nextAttemptAt, lang)}</span>}
                      <span dir="ltr" className="font-mono">{d.id}</span>
                    </div>
                    {open && (
                      <div className="space-y-2 border-t border-slate-100 p-3">
                        <CodeBlock title="payload" compact code={safeJson(d.payload)} />
                        {d.responseBody && <CodeBlock title={`response body (HTTP ${d.responseCode ?? "—"})`} compact code={d.responseBody} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
      </div>
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}
