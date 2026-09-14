import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface Notify {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export async function notify({ userIds, type, title, body, link }: Notify) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, type, title, body, link })),
  });
}

/** All active users belonging to a company (used to notify supplier staff). */
export async function companyUserIds(companyIds: string[]): Promise<string[]> {
  if (!companyIds.length) return [];
  const users = await prisma.user.findMany({
    where: { companyId: { in: companyIds }, active: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
