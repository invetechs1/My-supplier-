import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Append-only record of privileged actions (admin and supplier-owner changes) so that every
 * verification, refund, payout, setting or catalogue change can be traced back to a user.
 * Never throws: an audit failure must not break the action it describes.
 */
export async function audit(req: Request, action: string, entity: string, entityId?: string | null, meta?: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        meta: meta ? (meta as Prisma.InputJsonValue) : Prisma.JsonNull,
        ip: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? null,
      },
    });
  } catch (err) {
    console.warn("[audit] failed to record", action, err);
  }
}
