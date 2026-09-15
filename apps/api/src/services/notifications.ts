import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { escapeHtml, layout, mailEnabled, sendMail } from "./mailer";
import { sendPush } from "./push";

interface Notify {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  /** Also email (default true for everything except SYSTEM). */
  email?: boolean;
}

/**
 * Fan-out: in-app inbox (always) + Expo push to registered devices + email when SMTP is configured.
 * Push/email are best-effort and never fail the calling request.
 */
export async function notify({ userIds, type, title, body, link, email }: Notify) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return;
  await prisma.notification.createMany({ data: unique.map((userId) => ({ userId, type, title, body, link })) });

  void sendPush(unique, { title, body, data: { link, type } });

  if ((email ?? type !== "SYSTEM") && mailEnabled) {
    const users = await prisma.user.findMany({ where: { id: { in: unique }, active: true }, select: { email: true, name: true } });
    for (const u of users) {
      void sendMail(u.email, title, layout(title, `<p>Hi ${escapeHtml(u.name)},</p><p>${escapeHtml(body)}</p>`, link ? { label: "Open in MySupplier", url: `${env.webUrl}${link}` } : undefined), `${title}\n\n${body}${link ? `\n${env.webUrl}${link}` : ""}`).catch(() => undefined);
    }
  }
}

/** All active users belonging to a company (used to notify supplier staff). */
export async function companyUserIds(companyIds: string[]): Promise<string[]> {
  if (!companyIds.length) return [];
  const users = await prisma.user.findMany({ where: { companyId: { in: companyIds }, active: true }, select: { id: true } });
  return users.map((u) => u.id);
}
