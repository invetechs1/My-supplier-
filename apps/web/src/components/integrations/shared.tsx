"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ApiScope, WebhookDeliveryStatus, WebhookEvent } from "@mysupplier/shared";
import { cn } from "@/lib/format";
import { Badge } from "@/components/ui";

export type Perspective = "supplier" | "buyer";
export type Audience = Perspective | "both";

// ---------------------------------------------------------------------------
// Links (docs are not served by the web app – link to the repository)
// ---------------------------------------------------------------------------
const REPO_URL = "https://github.com/invetechs1/My-supplier-";
export const OPENAPI_URL = `${REPO_URL}/blob/HEAD/docs/openapi.yaml`;
export const OPENAPI_RAW_URL = `${REPO_URL}/raw/HEAD/docs/openapi.yaml`;
export const INTEGRATIONS_GUIDE_URL = `${REPO_URL}/blob/HEAD/docs/INTEGRATIONS.md`;

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------
export type ScopeGroup = "Catalogue" | "Supplier sync" | "Orders" | "Invoices" | "RFQs & bids" | "Webhooks";
export const SCOPE_GROUPS: readonly ScopeGroup[] = ["Catalogue", "Supplier sync", "Orders", "Invoices", "RFQs & bids", "Webhooks"] as const;

export const SCOPE_META: Record<ApiScope, { label: string; description: string; group: ScopeGroup; audience: Audience }> = {
  "catalog:read": { label: "Read catalogue", description: "Categories, materials (product master for SKU mapping) and best offers per SKU.", group: "Catalogue", audience: "both" },
  "prices:write": { label: "Push prices", description: "PUT /integrations/v1/prices – bulk upsert the company's price listings (up to 1000 rows).", group: "Supplier sync", audience: "supplier" },
  "stock:write": { label: "Push stock", description: "PUT /integrations/v1/stock – set absolute on-hand quantities of the company's listings.", group: "Supplier sync", audience: "supplier" },
  "orders:read": { label: "Read orders", description: "GET /integrations/v1/orders (sales orders) and /purchases (orders placed by the company).", group: "Orders", audience: "both" },
  "orders:write": { label: "Update order status", description: "PATCH /integrations/v1/orders/:reference/status – confirm, ship, deliver or cancel.", group: "Orders", audience: "supplier" },
  "invoices:read": { label: "Read invoices", description: "GET /integrations/v1/invoices – ZATCA e-invoice records with order totals (UBL XML optional).", group: "Invoices", audience: "both" },
  "rfqs:read": { label: "Read RFQs", description: "GET /integrations/v1/rfqs – open RFQs to bid on (supplier) or the company's own RFQs (buyer).", group: "RFQs & bids", audience: "both" },
  "rfqs:write": { label: "Create RFQs / bid", description: "POST /integrations/v1/rfqs (buyer) and POST /integrations/v1/rfqs/:id/bids (supplier).", group: "RFQs & bids", audience: "both" },
  "webhooks:manage": { label: "Manage webhooks", description: "Create and edit webhook endpoints with the key instead of a user login.", group: "Webhooks", audience: "both" },
};

export const DEFAULT_SCOPES: Record<Perspective, ApiScope[]> = {
  supplier: ["catalog:read", "prices:write", "stock:write", "orders:read", "orders:write", "invoices:read"],
  buyer: ["catalog:read", "orders:read", "invoices:read", "rfqs:read", "rfqs:write"],
};

export function scopeTone(scope: ApiScope): "green" | "amber" | "blue" | "slate" | "purple" {
  if (scope.endsWith(":write") || scope.endsWith(":manage")) return "amber";
  return "blue";
}

// ---------------------------------------------------------------------------
// Webhook events (from docs/INTEGRATIONS.md §3)
// ---------------------------------------------------------------------------
export const EVENT_META: Record<WebhookEvent, { description: string; sentTo: string; audience: Audience }> = {
  "order.created": { description: "A new order was placed.", sentTo: "supplier + buyer company", audience: "both" },
  "order.status_changed": { description: "Order moved to CONFIRMED, IN_TRANSIT or DELIVERED (carries previousStatus, note, trackingNumber).", sentTo: "supplier + buyer company", audience: "both" },
  "order.paid": { description: "Payment captured for an order.", sentTo: "supplier + buyer company", audience: "both" },
  "order.cancelled": { description: "Order cancelled (reserved stock released).", sentTo: "supplier + buyer company", audience: "both" },
  "payment.refunded": { description: "A refund was issued ({ amount, reason, method }).", sentTo: "supplier + buyer company", audience: "both" },
  "invoice.issued": { description: "ZATCA e-invoice issued for an order.", sentTo: "supplier + buyer company", audience: "both" },
  "rfq.created": { description: "A buyer published an RFQ in your city or for materials you list.", sentTo: "suppliers in the delivery city / listing the materials", audience: "supplier" },
  "bid.received": { description: "A supplier bid on one of your RFQs.", sentTo: "buyer company", audience: "buyer" },
  "bid.accepted": { description: "Your bid was accepted and an order was created.", sentTo: "winning supplier", audience: "supplier" },
  "stock.low": { description: "Listings fell to or below the low-stock threshold.", sentTo: "supplier", audience: "supplier" },
  "return.requested": { description: "A buyer requested a return (RMA) on an order.", sentTo: "supplier", audience: "supplier" },
  ping: { description: "Test event sent from the dashboard (\"Send test\").", sentTo: "the endpoint under test", audience: "both" },
};

export const DEFAULT_EVENTS: Record<Perspective, WebhookEvent[]> = {
  supplier: ["order.created", "order.status_changed", "order.paid", "order.cancelled", "payment.refunded"],
  buyer: ["order.status_changed", "order.paid", "invoice.issued", "bid.received"],
};

export function relevantTo(audience: Audience, perspective: Perspective): boolean {
  return audience === "both" || audience === perspective;
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------
export function useCopy(timeout = 1800): [string | null, (text: string, key?: string) => Promise<boolean>] {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = useCallback(
    async (text: string, key = text) => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        // Fallback for insecure contexts (http://localhost is fine, but be defensive).
        try {
          const el = document.createElement("textarea");
          el.value = text;
          el.setAttribute("readonly", "");
          el.style.position = "fixed";
          el.style.opacity = "0";
          document.body.appendChild(el);
          el.select();
          ok = document.execCommand("copy");
          document.body.removeChild(el);
        } catch {
          ok = false;
        }
      }
      if (timer.current) clearTimeout(timer.current);
      setCopied(ok ? key : null);
      if (ok) timer.current = setTimeout(() => setCopied(null), timeout);
      return ok;
    },
    [timeout],
  );
  return [copied, copy];
}

export function CopyButton({ text, label = "Copy", copiedLabel = "Copied", size = "sm", variant = "outline", className }: { text: string; label?: string; copiedLabel?: string; size?: "sm" | "xs"; variant?: "outline" | "dark"; className?: string }) {
  const [copied, copy] = useCopy();
  const done = copied === text;
  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
        size === "xs" ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs",
        variant === "dark" ? "bg-white/10 text-slate-100 hover:bg-white/20" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        done && (variant === "dark" ? "text-emerald-300" : "border-emerald-300 text-emerald-700"),
        className,
      )}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
        {done ? (
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        ) : (
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
        )}
      </svg>
      {done ? copiedLabel : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Code block (always LTR, dark, with copy)
// ---------------------------------------------------------------------------
export function CodeBlock({ code, title, className, compact }: { code: string; title?: string; className?: string; compact?: boolean }) {
  return (
    <div dir="ltr" className={cn("overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-start", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="truncate font-mono text-[11px] uppercase tracking-wide text-slate-400">{title ?? "code"}</span>
        <CopyButton text={code} size="xs" variant="dark" />
      </div>
      <pre className={cn("overflow-x-auto font-mono text-slate-100", compact ? "px-3 py-2 text-[11px] leading-relaxed" : "px-4 py-3 text-xs leading-relaxed")}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Inline monospace value (key prefix, URL) that stays LTR inside RTL layouts. */
export function Mono({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span dir="ltr" title={title} className={cn("inline-block max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 align-middle", className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export interface TabItem<K extends string> {
  key: K;
  label: React.ReactNode;
  count?: number;
}

export function Tabs<K extends string>({ tabs, value, onChange, size = "md", className }: { tabs: TabItem<K>[]; value: K; onChange: (key: K) => void; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1", className)}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-brand-50 text-brand-700" : "bg-slate-200 text-slate-600")}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery status
// ---------------------------------------------------------------------------
export function DeliveryStatusBadge({ status }: { status: WebhookDeliveryStatus | string }) {
  const tone = status === "SUCCESS" ? "green" : status === "FAILED" ? "red" : "amber";
  return <Badge tone={tone}>{status}</Badge>;
}

export function ScopeChips({ scopes, max = 4 }: { scopes: ApiScope[]; max?: number }) {
  const shown = scopes.slice(0, max);
  const rest = scopes.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <Badge key={s} tone={scopeTone(s)} title={SCOPE_META[s]?.description}>
          <span dir="ltr" className="font-mono">{s}</span>
        </Badge>
      ))}
      {rest > 0 && <Badge tone="slate" title={scopes.slice(max).join(", ")}>+{rest}</Badge>}
    </span>
  );
}

export function EventChips({ events, max = 3 }: { events: Array<WebhookEvent | "*">; max?: number }) {
  if (events.includes("*")) return <Badge tone="purple">All events (*)</Badge>;
  const shown = events.slice(0, max);
  const rest = events.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((e) => (
        <Badge key={e} tone="blue" title={e !== "*" ? EVENT_META[e]?.description : undefined}>
          <span dir="ltr" className="font-mono">{e}</span>
        </Badge>
      ))}
      {rest > 0 && <Badge tone="slate" title={events.slice(max).join(", ")}>+{rest}</Badge>}
    </span>
  );
}

/** datetime-local → ISO string (null when empty, undefined when unparsable). */
export function localToIso(v: string): string | null | undefined {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
