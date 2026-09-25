import nodemailer from "nodemailer";
import { env } from "../lib/env";

const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export const mailEnabled = Boolean(transport);

export async function sendMail(to: string, subject: string, html: string, text?: string) {
  if (!transport) {
    if (!env.isProd) console.log(`[mail:dev] to=${to} subject="${subject}"\n${text ?? html.replace(/<[^>]+>/g, "")}`);
    return { sent: false };
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, html, text });
  return { sent: true };
}

export const escapeHtml = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** `title` and `cta.label` are escaped here; `body` is trusted HTML – escape user data before building it. */
export function layout(title: string, body: string, cta?: { label: string; url: string }) {
  title = escapeHtml(title);
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Inter,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#0B6E4F;color:#fff;padding:20px 24px;font-weight:700;font-size:18px">MySupplier <span style="font-weight:400;opacity:.85;font-size:13px">· Build for less · البناء بأقل تكلفة</span></div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:20px">${title}</h2>
      <div style="font-size:15px;line-height:1.6">${body}</div>
      ${cta ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(cta.url)}" style="background:#F2A900;color:#111827;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${escapeHtml(cta.label)}</a></p>` : ""}
      <p style="color:#6b7280;font-size:12px;margin-top:24px">MySupplier · Build for less · البناء بأقل تكلفة · Riyadh, Saudi Arabia · Prices in SAR incl. VAT where stated.</p>
    </div></div></body></html>`;
}
