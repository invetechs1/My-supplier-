"use client";

import React, { useState } from "react";
import type { AdminShipmentRow, CarrierCode, CarrierIntegration, CarrierMode, CarrierTestResult } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, LoadingBlock, Table, type Column } from "./ui";
import { ShipmentStatusBadge } from "./OrderShipments";

const MODE_KEY: Record<CarrierMode, TranslationKey> = { live: "ship.modeLive", sandbox: "ship.modeSandbox", manual: "ship.modeManual" };
const MODE_TONE: Record<CarrierMode, "green" | "amber" | "slate"> = { live: "green", sandbox: "amber", manual: "slate" };

export function CarrierModeBadge({ mode }: { mode: CarrierMode }) {
  const { t } = useI18n();
  return <Badge tone={MODE_TONE[mode]}>{t(MODE_KEY[mode])}</Badge>;
}

function CopyButton({ value }: { value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the URL is visible next to the button */
    }
  };
  return <Button size="sm" variant="outline" onClick={copy}>{copied ? t("ship.copied") : t("ship.copy")}</Button>;
}

/** One carrier: mode badge, env checklist (names only), webhook URL + secret state, Test button. */
function CarrierCard({ c }: { c: CarrierIntegration }) {
  const { t, lang } = useI18n();
  const [result, setResult] = useState<CarrierTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manualKind = c.kind === "OWN_FLEET";

  const test = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.adminTestCarrier(c.code));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{lang === "ar" ? c.nameAr : c.name} <span className="ms-1 font-mono text-xs font-normal text-slate-400">{c.code}</span></p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <CarrierModeBadge mode={c.mode} />
            {!manualKind && (c.webhookSecured ? <Badge tone="green">{t("ship.webhookSecured")}</Badge> : <Badge tone="amber">{t("ship.webhookOpen")}</Badge>)}
            {!c.enabled && <Badge tone="red">Disabled</Badge>}
          </div>
        </div>
        {!manualKind && <Button size="sm" onClick={test} loading={busy} disabled={c.mode === "manual"}>{busy ? t("ship.testing") : t("ship.test")}</Button>}
      </div>
      {!manualKind && (
        <>
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("ship.envStatus")}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {[...c.env.required.map((e) => ({ ...e, required: true })), ...c.env.optional.map((e) => ({ ...e, required: false }))].map((e) => (
                <li key={e.name} className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[11px]", e.set ? "border-emerald-200 bg-emerald-50 text-emerald-800" : e.required ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-500")} title={e.set ? t("ship.envSet") : t("ship.envMissing")}>
                  {e.name}{e.required && !e.set ? " *" : ""}
                </li>
              ))}
            </ul>
            {c.missing.length > 0 && <p className="mt-1 text-xs text-slate-500">{t("ship.configuredHint")}</p>}
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("ship.webhookUrl")}</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700" dir="ltr">{c.webhookUrl}</code>
              <CopyButton value={c.webhookUrl} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400" dir="ltr">{c.webhookSecretName} → x-signature (HMAC-SHA256) / x-webhook-token</p>
          </div>
        </>
      )}
      {manualKind && <p className="mt-2 text-xs text-slate-500">{t("ship.manualHint")}</p>}
      {error && <Alert className="mt-3">{error}</Alert>}
      {result && (
        <div className={cn("mt-3 rounded-lg border p-3 text-xs", result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800")}>
          <p className="font-semibold">{result.ok ? t("ship.testOk") : t("ship.testFailed")} · {t(MODE_KEY[result.mode])}</p>
          {result.steps.length ? <ul className="mt-1 space-y-0.5">{result.steps.map((s) => <li key={s.step} dir="ltr"><span className="font-mono">{s.ok ? "✓" : "✗"} {s.step}</span> · {s.detail}</li>)}</ul> : <p className="mt-1">{result.detail}</p>}
        </div>
      )}
    </div>
  );
}

/** Admin "Carriers" tab: integration state per carrier plus the most recent shipments across the platform. */
export function CarrierIntegrations() {
  const { t, lang } = useI18n();
  const integrations = useAsync(() => api.adminCarrierIntegrations(), []);
  const [carrierFilter, setCarrierFilter] = useState<CarrierCode | "">("");
  const shipments = useAsync(() => api.adminRecentShipments({ limit: 50, carrier: carrierFilter || undefined }), [carrierFilter]);

  const columns: Column<AdminShipmentRow>[] = [
    { key: "carrier", header: t("ship.carrier"), render: (s) => <div><p className="font-medium text-slate-900">{s.carrierName}{s.sandbox && <Badge tone="amber" className="ms-2">{t("ship.modeSandbox")}</Badge>}</p>{s.service && <p className="text-xs text-slate-500">{s.service}</p>}</div> },
    { key: "tracking", header: t("ship.tracking"), render: (s) => <span className="font-mono text-xs" dir="ltr">{s.trackingNumber ?? s.externalId ?? "—"}</span> },
    { key: "status", header: t("common.status"), render: (s) => <ShipmentStatusBadge status={s.status} /> },
    { key: "order", header: t("ship.order"), render: (s) => <div><a href={`/admin/orders/${encodeURIComponent(s.order.id)}`} className="font-medium text-brand-700 hover:underline">{s.order.reference}</a><p className="text-xs text-slate-500">{s.order.supplier}{s.order.deliveryCity ? ` → ${s.order.deliveryCity}` : ""}</p></div> },
    { key: "updated", header: t("ship.updated"), align: "end", render: (s) => <span className="text-xs text-slate-600">{formatDateTime(s.updatedAt, lang)}</span> },
  ];

  return (
    <div className="space-y-6">
      {integrations.loading ? (
        <LoadingBlock />
      ) : integrations.error ? (
        <Alert onRetry={integrations.reload}>{integrations.error}</Alert>
      ) : (
        <>
          {integrations.data?.sandbox && <Alert kind="info">{t("ship.sandboxOn")}</Alert>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(integrations.data?.carriers ?? []).map((c) => <CarrierCard key={c.code} c={c} />)}
          </div>
        </>
      )}
      <Card>
        <CardHeader
          title={t("ship.recentShipments")}
          action={
            <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value as CarrierCode | "")} aria-label={t("ship.carrier")}>
              <option value="">{t("ship.carrier")}: —</option>
              {(integrations.data?.carriers ?? []).map((c) => <option key={c.code} value={c.code}>{lang === "ar" ? c.nameAr : c.name}</option>)}
            </select>
          }
        />
        {shipments.loading ? <LoadingBlock /> : shipments.error ? <CardBody><Alert onRetry={shipments.reload}>{shipments.error}</Alert></CardBody> : <Table columns={columns} rows={shipments.data ?? []} rowKey={(s) => s.id} dense empty={<EmptyState title={t("ship.noShipments")} />} />}
      </Card>
    </div>
  );
}
