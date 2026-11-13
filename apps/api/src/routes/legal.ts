/**
 * Legal documents: published versions (public), the caller's acceptance state and recording acceptances
 * from the web / mobile consent prompts. Registration records TERMS/PRIVACY/SUPPLIER_AGREEMENT at sign-up
 * through the same recordAcceptances() helper (routes/auth.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { LEGAL_DOCUMENTS, LEGAL_PATHS, LEGAL_REQUIRED_BY_ROLE, LEGAL_VERSIONS, SUPPLIER_FEES } from "@mysupplier/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { serialize } from "../lib/serialize";
import { myAcceptances, recordAcceptances } from "../services/legal";

const router = Router();
const documentSchema = z.enum(LEGAL_DOCUMENTS as unknown as [string, ...string[]]);

router.get("/legal/documents", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ versions: LEGAL_VERSIONS, paths: LEGAL_PATHS, fees: SUPPLIER_FEES, requiredByRole: LEGAL_REQUIRED_BY_ROLE });
});

router.get("/legal/acceptances/me", requireAuth(), asyncHandler(async (req, res) => {
  res.json(serialize(await myAcceptances(req.user!)));
}));

router.post("/legal/accept", requireAuth(), asyncHandler(async (req, res) => {
  const body = z.object({ documents: z.array(documentSchema).min(1).max(4), locale: z.enum(["en", "ar"]).optional() }).parse(req.body);
  const user = req.user!;
  await recordAcceptances({ userId: user.id, companyId: user.companyId, documents: [...new Set(body.documents)] as Parameters<typeof recordAcceptances>[0]["documents"], locale: body.locale, req });
  res.status(201).json(serialize(await myAcceptances(user)));
}));

export default router;
