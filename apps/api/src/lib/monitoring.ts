import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";
import { env } from "./env";

let enabled = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || enabled) return;
  Sentry.init({ dsn, environment: env.nodeEnv, release: env.version, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1) });
  enabled = true;
}

export const monitoringEnabled = () => enabled;

/** Forwards 5xx errors to Sentry (when configured) and passes them on to the JSON error handler. */
export function sentryErrorHandler(err: unknown, req: Request, _res: Response, next: NextFunction) {
  const status = (err as { status?: number })?.status ?? 500;
  if (enabled && status >= 500) {
    Sentry.withScope((scope) => {
      scope.setTag("route", `${req.method} ${req.path}`);
      if (req.user) scope.setUser({ id: req.user.id, role: req.user.role });
      Sentry.captureException(err);
    });
  }
  next(err);
}

export function captureClientError(report: { message: string; stack?: string; url?: string; userAgent?: string; platform?: string }, userId?: string) {
  if (enabled) {
    Sentry.withScope((scope) => {
      scope.setTag("source", "client");
      scope.setTag("platform", report.platform ?? "web");
      if (userId) scope.setUser({ id: userId });
      scope.setExtra("url", report.url);
      scope.setExtra("userAgent", report.userAgent);
      const e = new Error(report.message);
      if (report.stack) e.stack = report.stack;
      Sentry.captureException(e);
    });
  } else {
    console.warn(`[client-error] ${report.platform ?? "web"} ${report.url ?? ""}: ${report.message}`);
  }
}
