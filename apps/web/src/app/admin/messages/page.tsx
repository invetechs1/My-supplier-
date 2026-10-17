"use client";

import React, { useState } from "react";
import { api, type MessageLogEntry } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, LoadingBlock, PageHeader, Pagination, Select, StatTile, Table, type Column } from "@/components/ui";

const STATUS_TONE: Record<MessageLogEntry["status"], "green" | "red" | "amber" | "slate"> = { SENT: "green", FAILED: "red", SKIPPED: "amber", DEV: "slate" };

export default function AdminMessagesPage() {
  const { t, lang } = useI18n();
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [days, setDays] = useState("30");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.adminMessages({ channel: channel || undefined, status: status || undefined, days: Number(days), page }), [channel, status, days, page]);
  const d = state.data;
  const columns: Column<MessageLogEntry>[] = [
    { key: "when", header: "When", render: (m) => <span className="text-xs text-slate-500">{formatDateTime(m.createdAt, lang)}</span> },
    { key: "channel", header: "Channel", render: (m) => <Badge tone={m.channel === "WHATSAPP" ? "green" : "blue"}>{m.channel}</Badge> },
    { key: "kind", header: "Event", render: (m) => <span className="font-mono text-xs">{m.kind}</span> },
    { key: "to", header: "To", render: (m) => <div className="text-sm"><span className="font-mono" dir="ltr">{m.to}</span>{m.user && <span className="block text-xs text-slate-500">{m.user.name}{m.user.companyName ? ` · ${m.user.companyName}` : ""}</span>}</div> },
    { key: "body", header: "Message", render: (m) => <span className="block max-w-[420px] truncate text-xs text-slate-600" title={m.body}>{m.body || "—"}</span> },
    { key: "status", header: "Status", render: (m) => <span><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>{m.error && <span className="block max-w-[220px] truncate text-xs text-red-600" title={m.error}>{m.error}</span>}</span> },
  ];
  return (
    <div>
      <PageHeader title={t("admin.messages")} subtitle="Every WhatsApp and SMS alert the platform sent: new orders, RFQs, bids, order updates and price requests. Numbers are masked." />
      {d && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Providers" value={`${d.summary.configured.whatsapp ? "WhatsApp ✓" : "WhatsApp ✗"} · ${d.summary.configured.sms ? "SMS ✓" : "SMS ✗"}`} sub={d.summary.configured.whatsapp ? `Template: ${d.summary.configured.template ?? "none (text mode)"}` : "Set WHATSAPP_* in the server env to enable WhatsApp"} tone={d.summary.configured.whatsapp || d.summary.configured.sms ? "brand" : "amber"} />
          <StatTile label={`Sent (${days} days)`} value={formatNumber(d.summary.byStatus.SENT ?? 0, lang)} sub={`WhatsApp ${d.summary.byChannel.WHATSAPP ?? 0} · SMS ${d.summary.byChannel.SMS ?? 0}`} />
          <StatTile label="Failed / skipped" value={`${d.summary.byStatus.FAILED ?? 0} / ${d.summary.byStatus.SKIPPED ?? 0}`} sub={`Skipped = daily cap of ${d.summary.configured.dailyCap} reached`} tone={(d.summary.byStatus.FAILED ?? 0) > 0 ? "amber" : "default"} />
          <StatTile label="Top events" value={Object.entries(d.summary.byKind).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"} sub={Object.entries(d.summary.byKind).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(" · ") || "No messages yet"} />
        </div>
      )}
      <Card>
        <CardHeader title="Log" action={<div className="flex gap-2">
          <Select name="channel" value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} placeholder="All channels" options={[{ value: "WHATSAPP", label: "WhatsApp" }, { value: "SMS", label: "SMS" }]} className="w-36" />
          <Select name="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={["SENT", "FAILED", "SKIPPED", "DEV"].map((s) => ({ value: s, label: s }))} className="w-36" />
          <Select name="days" value={days} onChange={(e) => { setDays(e.target.value); setPage(1); }} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} className="w-28" />
        </div>} />
        {state.loading && !d ? <LoadingBlock /> : state.error ? <CardBody><Alert onRetry={state.reload}>{state.error}</Alert></CardBody> : (
          <>
            <Table columns={columns} rows={d?.data ?? []} rowKey={(m) => m.id} empty={<EmptyState title="No messages yet" description="Alerts appear here as soon as an order, RFQ, bid or price request triggers one." />} />
            {d && <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onChange={setPage} />}
          </>
        )}
      </Card>
    </div>
  );
}
