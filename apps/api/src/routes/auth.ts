import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, revokeUserTokens, signDownloadToken, DOWNLOAD_TOKEN_TTL_SECONDS, signToken } from "../middleware/auth";
import { badRequest, conflict, forbidden, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { env } from "../lib/env";
import { escapeHtml, layout, sendMail } from "../services/mailer";

/** Tighter limit for credential endpoints (brute-force protection). */
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts, try again later" } });

const router = Router();

const companySchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  type: z.enum(["SUPPLIER", "CONTRACTOR", "CONSULTANT", "OTHER"]).default("SUPPLIER"),
  city: z.string().min(2),
  crNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  phone: z.string().optional(),
});

const registerSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(["BUYER", "SUPPLIER"]).default("BUYER"),
  locale: z.enum(["en", "ar"]).default("en"),
  company: companySchema.optional(),
});

const userInclude = { company: true } as const;

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    if (body.role === "SUPPLIER" && !body.company) throw badRequest("Suppliers must provide company details");
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict("An account with this email already exists");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        phone: body.phone,
        role: body.role,
        locale: body.locale,
        companyRole: body.company ? "OWNER" : undefined,
        company: body.company
          ? { create: { ...body.company, type: body.role === "SUPPLIER" ? "SUPPLIER" : body.company.type, citiesServed: [body.company.city], branches: { create: { name: "Main branch", city: body.company.city, isDefault: true } } } }
          : undefined,
      },
      include: userInclude,
    });
    const token = signToken({ id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name, tokenVersion: user.tokenVersion });
    res.status(201).json({ token, user: serialize(user) });
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: userInclude });
    if (!user || !user.active) throw unauthorized("Invalid email or password");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized("Invalid email or password");
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
    const token = signToken({ id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name, tokenVersion: user.tokenVersion });
    res.json({ token, user: serialize(user) });
  }),
);

router.get(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: userInclude });
    res.json(serialize(user));
  }),
);

router.patch(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const data = z
      .object({ name: z.string().min(2).optional(), phone: z.string().optional(), locale: z.enum(["en", "ar"]).optional() })
      .parse(req.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { phone: true } });
    // A changed number must be verified again before it can be used for OTP login.
    const phoneChanged = data.phone !== undefined && data.phone !== current.phone;
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: { ...data, ...(phoneChanged ? { phoneVerified: false } : {}) }, include: userInclude });
    res.json(serialize(user));
  }),
);

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

router.get(
  "/invite/:token",
  asyncHandler(async (req, res) => {
    const invite = await prisma.companyInvite.findUnique({ where: { tokenHash: hashToken(req.params.token) }, include: { company: { select: { id: true, name: true, logoUrl: true } } } });
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) throw badRequest("This invitation is invalid or has expired");
    res.json({ company: invite.company, email: invite.email, name: invite.name, role: invite.role, expiresAt: invite.expiresAt });
  }),
);

router.post(
  "/accept-invite",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, name, password, phone } = z.object({ token: z.string().min(20), name: z.string().min(2), password: z.string().min(8), phone: z.string().optional() }).parse(req.body);
    const invite = await prisma.companyInvite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) throw badRequest("This invitation is invalid or has expired");
    let user = await prisma.user.findUnique({ where: { email: invite.email } });
    if (user) {
      if (!user.active) throw forbidden("This account is deactivated");
      if (user.role === "ADMIN") throw badRequest("Platform administrators cannot join a supplier team");
      if (user.companyId && user.companyId !== invite.companyId) throw conflict("This email already belongs to another company");
      user = await prisma.user.update({ where: { id: user.id }, data: { companyId: invite.companyId, role: "SUPPLIER", companyRole: invite.role, phone: phone ?? user.phone } });
    } else {
      user = await prisma.user.create({ data: { email: invite.email, name, phone, passwordHash: await bcrypt.hash(password, 10), role: "SUPPLIER", companyId: invite.companyId, companyRole: invite.role } });
    }
    await prisma.companyInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
    const jwtToken = signToken({ id: full.id, email: full.email, role: full.role, companyId: full.companyId, name: full.name, tokenVersion: full.tokenVersion });
    res.status(201).json({ token: jwtToken, user: serialize(full) });
  }),
);

router.post(
  "/forgot-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && user.active) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
      const url = `${env.webUrl}/reset-password?token=${token}`;
      await sendMail(user.email, "Reset your MySupplier password", layout("Reset your password", `<p>Hi ${escapeHtml(user.name)},</p><p>Click the button below to choose a new password. The link is valid for 1 hour.</p>`, { label: "Reset password", url }), `Reset your password: ${url}`);
    }
    res.json({ ok: true });
  }),
);

router.post(
  "/reset-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(20), password: z.string().min(8) }).parse(req.body);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) throw badRequest("This reset link is invalid or has expired");
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 } } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    res.json({ ok: true });
  }),
);

router.post(
  "/change-password",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw unauthorized("Current password is incorrect");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } } });
    res.json({ ok: true });
  }),
);

/** Account deletion (app-store requirement): deactivates and anonymises the login. */
router.delete(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const id = req.user!.id;
    await prisma.$transaction([
      prisma.device.deleteMany({ where: { userId: id } }),
      prisma.user.update({ where: { id }, data: { active: false, email: `deleted-${id}@deleted.mysupplier.sa`, name: "Deleted user", phone: null } }),
    ]);
    res.json({ ok: true });
  }),
);


/** 60-second, path-bound token for links that cannot send an Authorization header (invoices, exports, files). */
router.post(
  "/download-token",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { path } = z.object({ path: z.string().min(2).max(300).regex(/^\/[A-Za-z0-9._\-\/]+$/, "Invalid path") }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { tokenVersion: true } });
    res.json({ token: signDownloadToken(req.user!.id, path, user.tokenVersion), expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS });
  }),
);

/** Logout everywhere: bumps the token version so every issued session token is rejected from now on. */
router.post(
  "/logout",
  requireAuth(),
  asyncHandler(async (req, res) => {
    await revokeUserTokens(req.user!.id);
    res.json({ ok: true });
  }),
);

export default router;
