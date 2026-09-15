import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { captureClientError } from "../lib/monitoring";

const router = Router();

router.post(
  "/client-errors",
  rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const report = z.object({ message: z.string().min(1).max(1000), stack: z.string().max(8000).optional(), url: z.string().max(500).optional(), userAgent: z.string().max(300).optional(), platform: z.enum(["web", "ios", "android"]).optional() }).parse(req.body);
    captureClientError(report, req.user?.id);
    res.status(202).json({ ok: true });
  }),
);

export default router;
