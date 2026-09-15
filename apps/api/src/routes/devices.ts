import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post(
  "/devices",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { token, platform } = z.object({ token: z.string().min(10), platform: z.enum(["ios", "android", "web"]) }).parse(req.body);
    await prisma.device.upsert({
      where: { token },
      create: { token, platform, userId: req.user!.id },
      update: { platform, userId: req.user!.id },
    });
    res.json({ ok: true });
  }),
);

router.delete(
  "/devices/:token",
  requireAuth(),
  asyncHandler(async (req, res) => {
    await prisma.device.deleteMany({ where: { token: req.params.token, userId: req.user!.id } });
    res.json({ ok: true });
  }),
);

export default router;
