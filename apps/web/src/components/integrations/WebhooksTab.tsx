"use client";

import React, { useEffect, useState } from "react";
import type { WebhookDelivery, WebhookDeliveryStatus, WebhookEvent } from "@mysupplier/shared";
import { WEBHOOK_EVENTS } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { integrationsApi, type WebhookDeliveryResult, type WebhookEndpointCreated, type WebhookEndpointWithStats } from "@/lib/api/integrations";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
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

function describeResult(result: WebhookDeliveryResult, kind: "test" | "retry"): { kind: "success" | "error"; message: string } {
  const code = result.delivery.responseCode;
  const http = code ? ` (HTTP ${code})` : " (no response)";
  if (result.ok) return { kind: "success", message: `${kind === "test" ? "Test ping" : "Delivery"} delivered${http}.` };
  const tail = result.outcome === "retried" ? "A retry is scheduled – see the deliveries log." : "Marked as FAILED – see the deliveries log for the response.";
  return { kind: "error", message: `${kind === "test" ? "Test ping" : "Delivery"} not accepted${http}. ${tail}` };
}

export function WebhooksTab({ perspective }: { perspective: Perspective }) {
  const { lang } = useI18n();
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
    if (!url) next.url = "Enter the endpoint URL.";
    else {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") next.url = "Webhook URLs must use https://.";
      } catch {
        next.url = "Enter a valid absolute URL (https://…).";
      }
    }
    if (form.events.length === 0) next.events = "Select at least one event (or All events).";
    if (form.description.length > 200) next.description = "Keep the description under 200 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const events: EventSelection = allEvents ? ["*"] : WEBHOOK_EVENTS.filter((e) => form.events.includes(e));
    const description = form.description.trim() || null;
    setSaving(true);
    try {
      if (modal.editing) {
        const updated = await integrationsApi.updateWebhook(modal.editing.id, { url, events, description });
        state.setData((prev) => (prev ? prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)) : prev));
        setFlash({ kind: "success", message: "Endpoint updated." });
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
      setFlash({ kind: "success", message: `Endpoint ${active ? "activated" : "paused"}. ${active ? "" : "Events are skipped (not queued) while paused."}`.trim() });
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
      setFlash(describeResult(result, "test"));
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
      setFlash({ kind: "success", message: "Endpoint deleted." });
      setDeleteTarget(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<WebhookEndpointWithStats>[] = [
    { key: "url", header: "Endpoint", render: (e) => (
      <div className="min-w-[220px] max-w-[360px]">
        <p dir="ltr" className="truncate font-mono text-xs text-slate-900 text-start" title={e.url}>{e.url}</p>
        {e.description && <p className="truncate text-xs text-slate-500" title={e.description}>{e.description}</p>}
      </div>
    ) },
    { key: "events", header: "Events", render: (e) => <EventChips events={e.events} /> },
    { key: "deliveries", header: "Deliveries", render: (e) => {
      const d = e.deliveries ?? { PENDING: 0, SUCCESS: 0, FAILED: 0 };
      return (
        <button type="button" onClick={() => setDrawer(e)} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums hover:underline" title="Open the delivery log">
          <span className="text-emerald-700">{d.SUCCESS} ok</span>
          <span className="text-slate-300">·</span>
          <span className={d.FAILED > 0 ? "font-semibold text-red-600" : "text-slate-500"}>{d.FAILED} failed</span>
          {d.PENDING > 0 && <><span className="text-slate-300">·</span><span className="text-amber-700">{d.PENDING} pending</span></>}
        </button>
      );
    } },
    { key: "active", header: "Active", render: (e) => (
      <span className="inline-flex items-center gap-2">
        <Toggle checked={e.active} onChange={(v) => toggleActive(e, v)} disabled={busy === e.id} label={`Endpoint ${e.url} active`} />
        <span className={`text-xs ${e.active ? "text-emerald-700" : "text-slate-500"}`}>{e.active ? "Active" : "Paused"}</span>
      </span>
    ) },
    { key: "created", header: "Created", render: (e) => <span className="whitespace-nowrap text-slate-500" title={formatDateTime(e.createdAt, lang)}>{formatDate(e.createdAt, lang)}</span> },
    { key: "actions", header: "", align: "end", render: (e) => (
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => sendTest(e)} loading={busy === e.id}>Send test</Button>
        <Button size="sm" variant="ghost" onClick={() => setDrawer(e)}>Deliveries</Button>
        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>Edit</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(e)}>Delete</Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <FlashMessage flash={flash} />
      <Card>
        <CardHeader
          title="Webhook endpoints"
          subtitle="We POST a signed JSON envelope to your ERP within seconds of each event. Reply 2xx within 10 s; failures retry after 1 min, 5 min, 30 min, 2 h and 12 h. Up to 10 endpoints per company."
          action={<Button variant="accent" onClick={openCreate}>+ Add endpoint</Button>}
        />
        {state.loading ? <LoadingBlock /> : state.error ? <div className="p-5"><Alert onRetry={state.reload}>{state.error}</Alert></div> : (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            empty={<EmptyState title="No webhook endpoints" description={perspective === "supplier" ? "Get new orders and payment events pushed straight into your ERP instead of polling." : "Get order status, invoices and supplier bids pushed to your procurement system."} action={<Button onClick={openCreate}>Add your first endpoint</Button>} />}
          />
        )}
      </Card>

      {/* ---------------------------------------------------------------- create / edit */}
      <Modal
        open={modal.open}
        wide
        title={modal.editing ? "Edit endpoint" : "Add webhook endpoint"}
        onClose={closeModal}
        footer={<><Button variant="outline" onClick={closeModal}>Cancel</Button><Button onClick={save} loading={saving}>{modal.editing ? "Save changes" : "Add endpoint"}</Button></>}
      >
        <div className="space-y-5">
          {errors.form && <Alert>{errors.form}</Alert>}
          <Input label="Endpoint URL" name="webhookUrl" type="url" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} error={errors.url} required placeholder="https://erp.example.com/hooks/mysupplier" hint="Must be a public https:// URL. Private / internal addresses are rejected." className="font-mono" />
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Events <span className="text-red-500">*</span></p>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" checked={allEvents} onChange={(e) => toggleAll(e.target.checked)} />
                All events (<span dir="ltr" className="font-mono">*</span>), including future ones
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
                        {!relevant && <Badge tone="slate">{meta.audience === "supplier" ? "supplier only" : "buyer only"}</Badge>}
                      </span>
                      <span className="block text-xs text-slate-500">{meta.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <Textarea label="Description (optional)" name="webhookDescription" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={errors.description} placeholder="e.g. SAP PI inbound – production" maxLength={200} />
          {!modal.editing && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">The signing secret is shown <strong>once</strong> after the endpoint is created. Use it to verify <Mono>X-MySupplier-Signature</Mono> on every delivery.</p>}
        </div>
      </Modal>

      {/* ---------------------------------------------------------------- one-time secret */}
      <Modal open={!!created} wide title="Endpoint created" onClose={() => setCreated(null)} footer={<Button onClick={() => setCreated(null)}>I have stored the secret</Button>}>
        {created && (
          <div className="space-y-4">
            <Alert kind="warning">
              <p className="font-semibold">Copy this signing secret now – it will not be shown again.</p>
              <p className="mt-1">{created.warning ?? "Use it to verify X-MySupplier-Signature. If you lose it, delete the endpoint and add it again."}</p>
            </Alert>
            <div>
              <p dir="ltr" className="mb-1 truncate font-mono text-xs text-slate-600 text-start">{created.endpoint.url}</p>
              <div dir="ltr" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <code className="min-w-0 flex-1 select-all break-all font-mono text-sm text-emerald-900">{created.secret}</code>
                <CopyButton text={created.secret} label="Copy secret" />
              </div>
            </div>
            <div className="text-xs text-slate-600">
              <p className="mb-1 font-medium text-slate-700">Every delivery carries</p>
              <CodeBlock title="headers" compact code={`X-MySupplier-Event: order.created\nX-MySupplier-Delivery: dlv_01HZX…          # unique per delivery – de-duplicate on it\nX-MySupplier-Timestamp: 1790326500          # unix seconds\nX-MySupplier-Signature: sha256=3f1a…        # HMAC-SHA256(secret, timestamp + "." + rawBody)`} />
              <p className="mt-2">Verification samples for Node and Python are in the <strong>Developer guide</strong> tab. Use <strong>Send test</strong> to receive a signed <Mono>ping</Mono> right away.</p>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------------------------------------------------------- delete */}
      <Modal
        open={!!deleteTarget}
        title="Delete endpoint"
        onClose={() => setDeleteTarget(null)}
        footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={remove} loading={deleting}>Delete</Button></>}
      >
        {deleteTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Delete <span dir="ltr" className="font-mono text-xs text-slate-900">{deleteTarget.url}</span>?</p>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">The delivery log for this endpoint is removed as well. To stop events temporarily, pause the endpoint instead.</p>
          </div>
        )}
      </Modal>

      {drawer && <DeliveriesDrawer endpoint={drawer} onClose={() => setDrawer(null)} onResult={(r) => setFlash(describeResult(r, "retry"))} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deliveries drawer
// ---------------------------------------------------------------------------
function DeliveriesDrawer({ endpoint, onClose, onResult }: { endpoint: WebhookEndpointWithStats; onClose: () => void; onResult: (r: WebhookDeliveryResult) => void }) {
  const { lang } = useI18n();
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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" onClick={onClose} role="dialog" aria-modal="true" aria-label="Webhook deliveries">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Deliveries</h3>
            <p dir="ltr" className="truncate font-mono text-xs text-slate-500 text-start" title={endpoint.url}>{endpoint.url}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Select name="deliveryStatus" value={status} onChange={(e) => { setStatus(e.target.value as WebhookDeliveryStatus | ""); setPage(1); }} placeholder="All statuses" options={[{ value: "PENDING", label: "Pending" }, { value: "SUCCESS", label: "Success" }, { value: "FAILED", label: "Failed" }]} className="w-40" aria-label="Filter by status" />
          <Select name="deliveryEvent" value={event} onChange={(e) => { setEvent(e.target.value); setPage(1); }} placeholder="All events" options={eventOptions} className="w-52" aria-label="Filter by event" />
          <Button size="sm" variant="ghost" onClick={state.reload} className="ms-auto">Refresh</Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <Alert className="mb-3">{error}</Alert>}
          {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : deliveries.length === 0 ? (
            <EmptyState title="No deliveries yet" description="Deliveries appear here as events fire. Use “Send test” to trigger a signed ping." />
          ) : (
            <ul className="space-y-3">
              {deliveries.map((d) => {
                const open = expanded === d.id;
                return (
                  <li key={d.id} className="rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                      <span dir="ltr" className="font-mono text-xs font-semibold text-slate-800">{d.event}</span>
                      <DeliveryStatusBadge status={d.status} />
                      <span className="text-xs text-slate-500 tabular-nums">{d.attempts} attempt{d.attempts === 1 ? "" : "s"}</span>
                      <span className="text-xs text-slate-500 tabular-nums">HTTP {d.responseCode ?? "—"}</span>
                      <span className="ms-auto flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : d.id)} aria-expanded={open}>{open ? "Hide" : "Details"}</Button>
                        <Button size="sm" variant="outline" onClick={() => retry(d)} loading={retrying === d.id}>{d.status === "SUCCESS" ? "Resend" : "Retry"}</Button>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                      <span title={formatDateTime(d.createdAt, lang)}>Created {timeAgo(d.createdAt)}</span>
                      <span>Delivered {d.deliveredAt ? formatDateTime(d.deliveredAt, lang) : "—"}</span>
                      {d.nextAttemptAt && d.status === "PENDING" && <span>Next attempt {formatDateTime(d.nextAttemptAt, lang)}</span>}
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
