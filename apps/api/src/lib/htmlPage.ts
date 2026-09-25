import crypto from "node:crypto";
import type { Response } from "express";

/**
 * Server-rendered HTML pages (printable invoice, delivery note, hosted payment page) need inline
 * scripts, which the global helmet CSP forbids. Each page gets its own nonce and a CSP that allows
 * exactly that nonce (plus the payment gateway where needed) — nothing else can run on the page.
 */
export function htmlPage(res: Response, opts: { scriptSrc?: string[]; styleSrc?: string[]; connectSrc?: string[]; frameSrc?: string[]; formAction?: string[] } = {}): { nonce: string } {
  const nonce = crypto.randomBytes(16).toString("base64");
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    `script-src 'nonce-${nonce}' ${(opts.scriptSrc ?? []).join(" ")}`.trim(),
    `style-src 'self' 'unsafe-inline' ${(opts.styleSrc ?? []).join(" ")}`.trim(),
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${(opts.connectSrc ?? []).join(" ")}`.trim(),
    `frame-src ${(opts.frameSrc ?? ["'none'"]).join(" ")}`,
    `form-action 'self' ${(opts.formAction ?? []).join(" ")}`.trim(),
    "frame-ancestors 'none'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return { nonce };
}
