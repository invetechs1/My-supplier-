import type { ClientErrorReport } from "@mysupplier/shared";
import { API_URL, getToken } from "./api";

/** At most this many reports per rolling minute; anything beyond is dropped silently. */
const MAX_PER_MINUTE = 5;
const WINDOW_MS = 60_000;

const sentAt: number[] = [];
const recent = new Map<string, number>();

function allow(key: string): boolean {
  const now = Date.now();
  while (sentAt.length > 0 && now - sentAt[0] > WINDOW_MS) sentAt.shift();
  if (sentAt.length >= MAX_PER_MINUTE) return false;
  // De-duplicate identical messages fired in quick succession (React double render, event storms).
  const last = recent.get(key);
  if (last && now - last < 5_000) return false;
  recent.set(key, now);
  sentAt.push(now);
  return true;
}

/**
 * Page location for a report: origin + pathname only (never the query string, which can carry
 * `?token=` / `?next=`), with secret path segments masked.
 */
export function reportLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return `${window.location.origin}${maskPath(window.location.pathname)}`;
  } catch {
    return undefined;
  }
}

export function maskPath(pathname: string): string {
  return pathname.replace(/^\/update-prices\/[^/]+/, "/update-prices/[token]").replace(/^\/reset-password\/[^/]+/, "/reset-password/[token]");
}

function toReport(input: unknown, extra: Partial<ClientErrorReport> = {}): ClientErrorReport | null {
  let message = "";
  let stack: string | undefined;
  if (input instanceof Error) {
    message = input.message || input.name;
    stack = input.stack;
  } else if (typeof input === "string") {
    message = input;
  } else if (input && typeof input === "object") {
    const anyInput = input as { message?: unknown; reason?: unknown };
    if (typeof anyInput.message === "string") message = anyInput.message;
    else if (anyInput.reason) return toReport(anyInput.reason, extra);
    else {
      try {
        message = JSON.stringify(input).slice(0, 500);
      } catch {
        message = String(input);
      }
    }
  } else if (input !== undefined && input !== null) {
    message = String(input);
  }
  message = message.trim();
  if (!message) return null;
  // Noise we never want to report.
  if (/ResizeObserver loop|Script error\.?$|Cannot reach the MySupplier API/i.test(message)) return null;
  return {
    message: message.slice(0, 1000),
    stack: (extra.stack ?? stack)?.slice(0, 8000),
    url: extra.url ?? reportLocation(),
    userAgent: extra.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    platform: "web",
  };
}

/**
 * Fire-and-forget POST /client-errors. Never throws, never blocks, throttled to 5 per minute.
 * Uses `fetch` with `keepalive` so reports survive page unloads.
 */
export function reportClientError(input: unknown, extra: Partial<ClientErrorReport> = {}): void {
  try {
    if (typeof window === "undefined") return;
    const report = toReport(input, extra);
    if (!report) return;
    if (!allow(`${report.message}|${report.url ?? ""}`)) return;
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(`${API_URL}/client-errors`, { method: "POST", headers, body: JSON.stringify(report), keepalive: true, cache: "no-store" }).catch(() => undefined);
  } catch {
    /* reporting must never break the app */
  }
}

let installed = false;

/** Global `window.onerror` / `unhandledrejection` hook; safe to call more than once. */
export function installClientErrorReporting(): () => void {
  if (typeof window === "undefined" || installed) return () => undefined;
  installed = true;
  const onError = (event: ErrorEvent) => {
    reportClientError(event.error ?? event.message, {
      stack: event.error instanceof Error ? event.error.stack : event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientError(event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}
