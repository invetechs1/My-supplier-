"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { OutreachChannel, OutreachRequestResult, OutreachSupplier } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useDebounce, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Textarea, VerifiedBadge } from "@/components/ui";

function StaleDays({ days }: { days: number | null }) {
  if (days === null || days === undefined) return <Badge tone="slate">Never</Badge>;
  const tone = days > 30 ? "red" : days > 14 ? "amber" : "green";
  return (
    <Badge tone={tone} className="tabular-nums">
      {days} d
    </Badge>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function AdminOutreachPage() {
  const { t, lang } = useI18n();
  const [staleDays, setStaleDays] = useState("14");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const debouncedStale = useDebounce(staleDays, 400);
  const state = useAsync(() => api.outreachSuppliers({ staleDays: debouncedStale === "" ? undefined : Number(debouncedStale), q: debouncedQ.trim() || undefined }), [debouncedStale, debouncedQ]);
  const [flash, setFlash] = useFlash(6000);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState<OutreachChannel | null>(null);
  const [results, setResults] = useState<{ channel: OutreachChannel; items: OutreachRequestResult[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const list = useMemo(() => state.data ?? [], [state.data]);
  const allSelected = list.length > 0 && list.every((s) => selected.has(s.company.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(list.map((s) => s.company.id)));
  };
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = async (channel: OutreachChannel) => {
    const companyIds = Array.from(selected);
    if (companyIds.length === 0) return;
    setSending(channel);
    try {
      const res = await api.sendOutreach({ companyIds, channel, message: message.trim() || undefined });
      setResults({ channel, items: res });
      if (channel === "LINK") {
        const ok = await copyText(res.map((r) => `${r.companyName}: ${r.link}`).join("\n"));
        setFlash({ kind: "success", message: ok ? `${res.length} link${res.length === 1 ? "" : "s"} copied to the clipboard.` : `${res.length} link${res.length === 1 ? "" : "s"} generated (copy them below).` });
      } else if (channel === "EMAIL") {
        const emailed = res.filter((r) => r.emailed).length;
        setFlash({ kind: "success", message: `Update link emailed to ${emailed} of ${res.length} supplier${res.length === 1 ? "" : "s"}.` });
      } else {
        setFlash({ kind: "success", message: `${res.filter((r) => r.whatsappUrl).length} WhatsApp link${res.length === 1 ? "" : "s"} ready below.` });
      }
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSending(null);
    }
  };

  const copyOne = async (key: string, text: string) => {
    const ok = await copyText(text);
    setCopied(ok ? key : null);
    if (ok) setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  return (
    <div>
      <PageHeader
        title={t("admin.outreach")}
        subtitle="Suppliers whose prices are going stale. Send them a magic link (no login needed) to refresh their prices in two minutes. Links expire after 14 days."
      />
      <FlashMessage flash={flash} className="mb-4" />

      <Card className="mb-4">
        <CardBody className="grid gap-4 md:grid-cols-[160px_1fr_auto]">
          <Input label="Stale for ≥ days" name="staleDays" type="number" min={0} value={staleDays} onChange={(e) => setStaleDays(e.target.value)} dir="ltr" hint="Blank = all suppliers" />
          <Input label="Search" name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Supplier name, city, email…" />
          <div className="flex items-end">
            <Button variant="outline" onClick={state.reload}>
              Refresh
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{selected.size}</span> selected
            </span>
            <span className="flex-1" />
            <Button size="sm" onClick={() => send("EMAIL")} disabled={selected.size === 0 || !!sending} loading={sending === "EMAIL"}>
              Email update link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => send("WHATSAPP")} disabled={selected.size === 0 || !!sending} loading={sending === "WHATSAPP"}>
              Get WhatsApp links
            </Button>
            <Button size="sm" variant="outline" onClick={() => send("LINK")} disabled={selected.size === 0 || !!sending} loading={sending === "LINK"}>
              Copy links
            </Button>
          </div>
          <Textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Optional personal note included in the email / WhatsApp message…" className="text-sm" />
        </CardBody>
      </Card>

      <Card>
        {state.loading && !state.data ? (
          <LoadingBlock />
        ) : state.error ? (
          <div className="p-5">
            <Alert onRetry={state.reload}>{state.error}</Alert>
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="No suppliers match" description="Lower the stale-days threshold or clear the search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                  </th>
                  <th className="px-4 py-3 text-start">Supplier</th>
                  <th className="px-4 py-3 text-start">{t("common.city")}</th>
                  <th className="px-4 py-3 text-start">Contact</th>
                  <th className="px-4 py-3 text-end">Listings</th>
                  <th className="px-4 py-3 text-start">Last update</th>
                  <th className="px-4 py-3 text-start">Stale</th>
                  <th className="px-4 py-3 text-start">Pending request</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {list.map((s: OutreachSupplier) => {
                  const id = s.company.id;
                  const checked = selected.has(id);
                  return (
                    <tr key={id} className={cn(checked && "bg-brand-50/40")}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={checked} onChange={() => toggle(id)} aria-label={`Select ${s.company.name}`} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/suppliers/${id}`} className="font-medium text-slate-900 hover:text-brand-700">
                            {s.company.name}
                          </Link>
                          <VerifiedBadge verified={s.company.verified} />
                        </div>
                        {s.company.nameAr && <p className="text-xs text-slate-500" dir="rtl">{s.company.nameAr}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.company.city}</td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700" dir="ltr">{s.contactEmail ?? <span className="text-slate-400">no email</span>}</p>
                        <p className="text-xs text-slate-500" dir="ltr">{s.contactPhone ?? <span className="text-slate-400">no phone</span>}</p>
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{s.listingCount}</td>
                      <td className="px-4 py-3 text-slate-600" title={s.lastPriceUpdate ? formatDateTime(s.lastPriceUpdate, lang) : undefined}>
                        {s.lastPriceUpdate ? timeAgo(s.lastPriceUpdate) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StaleDays days={s.staleDays} />
                      </td>
                      <td className="px-4 py-3">
                        {s.pendingRequest ? (
                          <span className="text-xs text-slate-600">
                            <Badge tone="blue">{s.pendingRequest.channel}</Badge> sent {timeAgo(s.pendingRequest.sentAt)} · expires {formatDateTime(s.pendingRequest.expiresAt, lang)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {results && (
        <Card className="mt-6">
          <CardHeader
            title={results.channel === "EMAIL" ? "Emails sent" : results.channel === "WHATSAPP" ? "WhatsApp links" : "Update links"}
            subtitle={`${results.items.length} supplier${results.items.length === 1 ? "" : "s"} · links expire in 14 days`}
            action={
              <Button size="sm" variant="outline" onClick={() => copyOne("all", results.items.map((r) => `${r.companyName}: ${r.link}`).join("\n"))}>
                {copied === "all" ? "Copied" : "Copy all links"}
              </Button>
            }
          />
          <ul className="divide-y divide-slate-100">
            {results.items.map((r) => (
              <li key={r.companyId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{r.companyName}</p>
                  <p className="truncate text-xs text-slate-500" dir="ltr">
                    {r.link}
                  </p>
                </div>
                {r.emailed && <Badge tone="green">Emailed</Badge>}
                <Button size="sm" variant="outline" onClick={() => copyOne(r.companyId, r.link)}>
                  {copied === r.companyId ? "Copied" : "Copy link"}
                </Button>
                {r.whatsappUrl && (
                  <a
                    href={r.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Open WhatsApp ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
