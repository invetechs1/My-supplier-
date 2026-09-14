import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { serialize } from "../lib/serialize";

const router = Router();

router.get(
  "/notifications",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unread === "1" || req.query.unread === "true";
    const userId = req.user!.id;
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId, ...(unreadOnly ? { read: false } : {}) }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);
    res.setHeader("X-Unread-Count", String(unread));
    res.setHeader("Access-Control-Expose-Headers", "X-Unread-Count");
    res.json(serialize(items));
  }),
);

router.post(
  "/notifications/read-all",
  requireAuth(),
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
    res.json({ ok: true });
  }),
);

router.post(
  "/notifications/:id/read",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.update({ where: { id: req.params.id, userId: req.user!.id }, data: { read: true } });
    res.json(serialize(n));
  }),
);

export default router;
