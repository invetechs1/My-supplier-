import { Platform } from "react-native";
import type { ClientErrorReport } from "@mysupplier/shared";
import { api } from "./api";

/**
 * Best-effort client error reporting: POST /client-errors for uncaught JS
 * errors and unhandled promise rejections. Throttled, deduplicated and
 * guaranteed never to throw (a failing reporter must not crash the app).
 */

const MIN_INTERVAL_MS = 5_000; // between any two reports
const MAX_PER_SESSION = 25;
const DEDUPE_WINDOW_MS = 60_000; // same message at most once per minute

let lastSentAt = 0;
let sentCount = 0;
const recent = new Map<string, number>();
let installed = false;

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

type HermesInternalLike = {
  enablePromiseRejectionTracker?: (opts: { allRejections: boolean; onUnhandled: (id: number, error: unknown) => void; onHandled?: (id: number) => void }) => void;
};

function platform(): ClientErrorReport["platform"] {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

function toReport(error: unknown, context?: string): ClientErrorReport | null {
  let message: string;
  let stack: string | undefined;
  if (error instanceof Error) {
    message = error.message || error.name || "Error";
    stack = error.stack;
  } else if (typeof error === "string") {
    message = error;
  } else {
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
  }
  if (!message) return null;
  if (context) message = `[${context}] ${message}`;
  const report: ClientErrorReport = {
    message: message.slice(0, 2000),
    stack: stack ? stack.slice(0, 8000) : undefined,
    platform: platform(),
  };
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      report.userAgent = navigator.userAgent;
      if (typeof location !== "undefined") report.url = location.href;
    } else {
      report.userAgent = `mysupplier-mobile/${Platform.OS} ${String(Platform.Version ?? "")}`.trim();
    }
  } catch {
    // ignore
  }
  return report;
}

function shouldSend(report: ClientErrorReport): boolean {
  const now = Date.now();
  if (sentCount >= MAX_PER_SESSION) return false;
  if (now - lastSentAt < MIN_INTERVAL_MS) return false;
  const key = report.message;
  const last = recent.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  // Keep the dedupe map small.
  if (recent.size > 50) {
    for (const [k, ts] of recent) if (now - ts > DEDUPE_WINDOW_MS) recent.delete(k);
  }
  recent.set(key, now);
  lastSentAt = now;
  sentCount += 1;
  return true;
}

/** Report an error to the API. Fire-and-forget; never throws or rejects. */
export function reportClientError(error: unknown, context?: string): void {
  try {
    const report = toReport(error, context);
    if (!report || !shouldSend(report)) return;
    // Do not report our own network failures (offline loops).
    if (/Cannot reach the server/i.test(report.message)) return;
    api.reportClientError(report).catch(() => undefined);
  } catch {
    // swallow – reporting must never break the app
  }
}

/** Install global handlers once (uncaught errors + unhandled promise rejections). */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;
  try {
    const g = globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike; HermesInternal?: HermesInternalLike };

    // React Native: ErrorUtils global handler (chain to the previous one so
    // dev red-box / release crash behaviour is unchanged).
    const errorUtils = g.ErrorUtils;
    if (errorUtils?.setGlobalHandler) {
      const previous = errorUtils.getGlobalHandler?.();
      errorUtils.setGlobalHandler((error, isFatal) => {
        reportClientError(error, isFatal ? "fatal" : "uncaught");
        if (previous) previous(error, isFatal);
      });
    }

    // Hermes: promise rejection tracker.
    const hermes = g.HermesInternal;
    if (hermes?.enablePromiseRejectionTracker) {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (_id, error) => reportClientError(error, "unhandledrejection"),
      });
    }

    // Web (and JSC environments exposing window events).
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
        reportClientError(event?.reason, "unhandledrejection");
      });
      window.addEventListener("error", (event: ErrorEvent) => {
        reportClientError(event?.error ?? event?.message, "uncaught");
      });
    }
  } catch {
    // never throw from installation
  }
}
