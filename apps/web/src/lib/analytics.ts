"use client";

/**
 * First-party, consent-gated analytics. Nothing is sent until the visitor chose "Accept" in the cookie
 * banner; "Essential only" keeps everything local. Events are batched and flushed with sendBeacon so
 * they never slow the page. The anonymous session id also travels on API calls (X-Session-Id) so
 * server-side conversions (orders, RFQs, BOQs, sign-ups) join the same funnel.
 */
import { API_URL } from "./api";
import { CONSENT_KEY } from "@/components/CookieBanner";

export type ClientEvent = "page_view" | "search" | "product_view" | "add_to_cart" | "checkout_start" | "boq_start" | "rfq_start" | "supplier_cta";

const SESSION_KEY = "ms_sid";
const queue: { name: ClientEvent; path?: string; city?: string; props?: Record<string, unknown>; at: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function readConsent(): boolean {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    return raw ? (JSON.parse(raw) as { value?: string }).value === "accepted" : false;
  } catch {
    return false;
  }
}

/** Anonymous per-browser session id (rotates after 30 minutes of inactivity). Null without consent. */
export function sessionId(): string | null {
  if (typeof window === "undefined" || !readConsent()) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const now = Date.now();
    if (raw) {
      const { id, t } = JSON.parse(raw) as { id: string; t: number };
      if (now - t < 30 * 60_000) { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, t: now })); return id; }
    }
    const id = `s_${Math.random().toString(36).slice(2, 10)}${now.toString(36)}`;
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, t: now }));
    return id;
  } catch {
    return null;
  }
}

function flush() {
  timer = null;
  const sid = sessionId();
  if (!sid || !queue.length) { queue.length = 0; return; }
  const events = queue.splice(0, 20);
  const body = JSON.stringify({ sessionId: sid, events });
  const url = `${API_URL}/analytics/events`;
  try {
    // text/plain keeps the beacon a "simple" cross-origin request (no preflight, which beacons cannot do).
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return;
  } catch { /* fall through */ }
  void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

/** Queue an event; no-op without consent. */
export function track(name: ClientEvent, props?: Record<string, unknown>, opts: { city?: string | null } = {}) {
  if (typeof window === "undefined" || !readConsent()) return;
  queue.push({ name, path: window.location.pathname, city: opts.city ?? undefined, props, at: new Date().toISOString() });
  if (queue.length >= 10) flush();
  else if (!timer) timer = setTimeout(flush, 4000);
}

/** Flush pending events when the tab is hidden or closed. */
export function installAnalytics() {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;
  const onHide = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
  return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); installed = false; };
}
