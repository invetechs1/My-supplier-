"use client";

import Link from "next/link";
import { useState } from "react";
import type { Notification } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/format";
import { Alert, Button, Card, EmptyState, FlashMessage, LoadingBlock, PageHeader } from "./ui";

const typeTone: Record<string, string> = {
  NEW_RFQ: "bg-sky-100 text-sky-700",
  NEW_BID: "bg-amber-100 text-amber-800",
  BID_ACCEPTED: "bg-emerald-100 text-emerald-700",
  BID_REJECTED: "bg-red-100 text-red-700",
  ORDER_UPDATE: "bg-violet-100 text-violet-700",
  SYSTEM: "bg-slate-100 text-slate-700",
};

export function NotificationsPanel() {
  const { t, lang } = useI18n();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const state = useAsync(() => api.notifications(unreadOnly), [unreadOnly]);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState(false);

  const markOne = async (n: Notification) => {
    if (n.read) return;
    try {
      await api.markRead(n.id);
      state.setData((prev) => (prev ? { ...prev, unread: Math.max(0, prev.unread - 1), items: prev.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) } : prev));
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await api.markAllRead();
      state.setData((prev) => (prev ? { ...prev, unread: 0, items: prev.items.map((x) => ({ ...x, read: true })) } : prev));
      setFlash({ kind: "success", message: "All notifications marked as read." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("dash.notifications")}
        subtitle={state.data ? `${state.data.unread} unread` : undefined}
        action={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Unread only
            </label>
            <Button variant="outline" size="sm" onClick={markAll} loading={busy} disabled={!state.data || state.data.unread === 0}>
              Mark all read
            </Button>
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (state.data?.items.length ?? 0) === 0 ? (
        <Card><EmptyState title="You're all caught up" description="New RFQs, bids and order updates will appear here." /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {state.data!.items.map((n) => {
              const inner = (
                <div className="flex gap-3">
                  <span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-amber-500")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-sm", n.read ? "font-medium text-slate-700" : "font-semibold text-slate-900")}>{n.title}</p>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", typeTone[n.type] ?? typeTone.SYSTEM)}>{n.type.replace(/_/g, " ")}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt, lang)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className={cn("px-5 py-4 transition hover:bg-slate-50", !n.read && "bg-amber-50/30")}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => void markOne(n)} className="block">{inner}</Link>
                  ) : (
                    <button type="button" onClick={() => void markOne(n)} className="block w-full text-start">{inner}</button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
