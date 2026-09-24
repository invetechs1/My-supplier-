"use client";

import React, { useState } from "react";
import type { AuditLogEntry } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync, useDebounce, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Pagination, Select, Table, type Column } from "@/components/ui";

const ENTITIES = ["User", "Company", "Coupon", "Review", "Order", "Payout", "PlatformSetting", "ContactMessage", "Announcement"] as const;

const ENTITY_LABEL: Record<string, string> = {
  User: "User",
  Company: "Company",
  Coupon: "Coupon",
  Review: "Review",
  Order: "Order",
  Payout: "Payout",
  PlatformSetting: "Platform setting",
  ContactMessage: "Contact message",
  Announcement: "Announcement",
};

const MAX_META_KEYS = 6;

function actionTone(action: string): "green" | "amber" | "red" | "blue" | "slate" | "purple" {
  const verb = action.split(".").pop() ?? action;
  if (/delete|remove|reject|ban|hide|suspend|fail/.test(verb)) return "red";
  if (/refund|reverse|cancel/.test(verb)) return "amber";
  if (/create|send|approve|verify|pay|publish|restore/.test(verb)) return "green";
  if (/update|edit|change|set/.test(verb)) return "blue";
  return "slate";
}

function metaValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function MetaChips({ meta }: { meta: Record<string, unknown> | null | undefined }) {
  const entries = Object.entries(meta ?? {}).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return <span className="text-slate-400">—</span>;
  const shown = entries.slice(0, MAX_META_KEYS);
  const hidden = entries.length - shown.length;
  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {shown.map(([k, v]) => {
        const full = metaValue(v);
        return (
          <span key={k} title={`${k}: ${full}`} className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200">
            <span className="font-medium text-slate-500">{k}:</span>
            <span className="truncate" dir="auto">{truncate(full)}</span>
          </span>
        );
      })}
      {hidden > 0 && <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] text-slate-400" title={entries.slice(MAX_META_KEYS).map(([k, v]) => `${k}: ${metaValue(v)}`).join("\n")}>+{hidden} more</span>}
    </div>
  );
}

export default function AdminAuditPage() {
  const { t, lang } = useI18n();
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const debouncedAction = useDebounce(action, 350);
  const debouncedQ = useDebounce(q, 350);
  const [page, setPage] = useState(1);
  const state = useAsync(
    () => api.adminAudit({ entity: entity || undefined, action: debouncedAction.trim() || undefined, q: debouncedQ.trim() || undefined, page }),
    [entity, debouncedAction, debouncedQ, page],
  );
  const [flash, setFlash] = useFlash(3000);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setFlash({ kind: "success", message: `Copied ${id}` });
    } catch {
      setFlash({ kind: "error", message: "Could not copy to clipboard." });
    }
  };

  const columns: Column<AuditLogEntry>[] = [
    { key: "time", header: "Time", render: (e) => <span className="whitespace-nowrap text-slate-500">{formatDateTime(e.createdAt, lang)}</span> },
    {
      key: "actor",
      header: "Actor",
      render: (e) => e.actor ? (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{e.actor.name}</div>
          <div className="truncate text-xs text-slate-500" dir="ltr">{e.actor.email}</div>
        </div>
      ) : (
        <span className="italic text-slate-400">system</span>
      ),
    },
    { key: "action", header: "Action", render: (e) => <Badge tone={actionTone(e.action)} className="font-mono normal-case">{e.action}</Badge> },
    {
      key: "entity",
      header: "Entity",
      render: (e) => (
        <div className="min-w-0">
          <div className="text-slate-700">{ENTITY_LABEL[e.entity] ?? e.entity}</div>
          {e.entityId && (
            <button
              type="button"
              onClick={() => copyId(e.entityId as string)}
              title={`${e.entityId} (click to copy)`}
              className="block max-w-[9rem] truncate font-mono text-xs text-slate-500 hover:text-brand-700"
              dir="ltr"
            >
              {e.entityId}
            </button>
          )}
        </div>
      ),
    },
    { key: "details", header: "Details", render: (e) => <MetaChips meta={e.meta} /> },
    { key: "ip", header: "IP", render: (e) => <span className="font-mono text-xs text-slate-400" dir="ltr">{e.ip ?? "—"}</span> },
  ];

  const rows = state.data?.data ?? [];
  const filtered = !!(entity || debouncedAction.trim() || debouncedQ.trim());

  return (
    <div>
      <PageHeader
        title={t("admin.audit")}
        subtitle="Who did what, and when. Privileged admin actions are recorded here automatically."
        action={
          <>
            <Select name="entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} placeholder="All entities" options={ENTITIES.map((en) => ({ value: en, label: ENTITY_LABEL[en] ?? en }))} />
            <Input name="action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="Action prefix, e.g. coupon." dir="ltr" className="w-48 font-mono" />
            <Input name="q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); state.reload(); } }} placeholder="Search actor, entity id or details" className="w-64" />
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />

      {state.loading && !state.data ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          {state.loading && <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Refreshing…</div>}
          <Table
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            dense
            empty={
              <EmptyState
                title={filtered ? "No matching entries" : "No audit entries yet"}
                description="Privileged actions — company verification, refunds, payouts, platform settings, coupons, review moderation and announcements — are recorded here with the admin who performed them."
                action={filtered ? <Button variant="outline" onClick={() => { setEntity(""); setAction(""); setQ(""); setPage(1); }}>Clear filters</Button> : undefined}
              />
            }
          />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
