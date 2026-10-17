/** Analytics ingestion (consent-gated, anonymous) and the admin funnel report. */
import { Router } from "express";
import { z } from "zod";
import express from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { CLIENT_EVENTS, funnelReport, recordEvents } from "../services/analytics";

const router = Router();

const eventSchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  path: z.string().max(200).optional(),
  city: z.string().max(40).optional(),
  props: z.record(z.unknown()).optional(),
  at: z.coerce.date().optional(),
});

/** Batched client events. The browser only calls this after analytics consent; no cookies are set. */
router.post(
  "/analytics/events",
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: "Too many analytics events" } }),
  express.text({ type: "text/plain", limit: "64kb" }), // navigator.sendBeacon sends text/plain to avoid a CORS preflight
  asyncHandler(async (req, res) => {
    let raw: unknown = req.body;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
    const body = z.object({ sessionId: z.string().min(8).max(64), events: z.array(eventSchema).min(1).max(20) }).parse(raw);
    const now = Date.now();
    const count = await recordEvents(body.events.map((e) => ({
      name: e.name, sessionId: body.sessionId, userId: req.user?.id ?? null, role: req.user?.role ?? null, path: e.path ?? null, city: e.city ?? null, props: e.props ?? null,
      // Client timestamps are accepted only within the last 10 minutes (offline batches), otherwise server time.
      createdAt: e.at && now - e.at.getTime() < 600_000 && e.at.getTime() <= now + 60_000 ? e.at : undefined,
    })));
    res.status(202).json({ accepted: count });
  }),
);

router.get("/admin/analytics/funnel", requireAuth("ADMIN"), asyncHandler(async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
  res.json(await funnelReport(days));
}));

export default router;
