import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, signToken } from "../middleware/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { normaliseSaudiPhone } from "../lib/security";
import { sendSms } from "../services/sms";

const router = Router();
const OTP_TTL_SEC = 300;
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const otpLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `${req.ip}:${normaliseSaudiPhone(String(req.body?.phone ?? "")) ?? "x"}`, message: { error: "Too many codes requested, try again in 15 minutes" } });
const userInclude = { company: true } as const;

async function issueCode(phone: string, purpose: string) {
  const code = env.isProd ? String(crypto.randomInt(100000, 999999)) : "123456";
  await prisma.otpCode.updateMany({ where: { phone, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.otpCode.create({ data: { phone, purpose, codeHash: hash(code), expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000) } });
  const { channel } = await sendSms(phone, `${code} is your MySupplier code. Valid for 5 minutes. رمز الدخول الخاص بك`);
  return { code, channel };
}

async function consumeCode(phone: string, purpose: string, code: string) {
  const rec = await prisma.otpCode.findFirst({ where: { phone, purpose, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!rec) throw badRequest("Code expired or not requested. Request a new code.");
  if (rec.attempts >= 5) throw badRequest("Too many wrong attempts. Request a new code.");
  if (rec.codeHash !== hash(code)) {
    await prisma.otpCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    throw badRequest("Incorrect code");
  }
  await prisma.otpCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
}

router.post(
  "/otp/request",
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { phone: raw, purpose } = z.object({ phone: z.string().min(9), purpose: z.enum(["LOGIN", "VERIFY_PHONE"]).default("LOGIN") }).parse(req.body);
    const phone = normaliseSaudiPhone(raw);
    if (!phone) throw badRequest("Enter a valid Saudi mobile number (05xxxxxxxx)");
    const { code, channel } = await issueCode(phone, purpose);
    res.json({ ok: true, expiresInSeconds: OTP_TTL_SEC, channel, ...(env.isProd ? {} : { devCode: code }) });
  }),
);

const companySchema = z.object({ name: z.string().min(2), nameAr: z.string().optional(), type: z.enum(["SUPPLIER", "CONTRACTOR", "CONSULTANT", "OTHER"]).default("SUPPLIER"), city: z.string().min(2), crNumber: z.string().optional(), vatNumber: z.string().optional(), phone: z.string().optional() });

router.post(
  "/otp/verify",
  rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const body = z.object({ phone: z.string().min(9), code: z.string().regex(/^\d{6}$/), name: z.string().min(2).optional(), role: z.enum(["BUYER", "SUPPLIER"]).default("BUYER"), company: companySchema.optional() }).parse(req.body);
    const phone = normaliseSaudiPhone(body.phone);
    if (!phone) throw badRequest("Invalid phone number");
    await consumeCode(phone, "LOGIN", body.code);
    // Prefer the account that verified this number; fall back to a single unverified match (legacy profiles).
    let user = await prisma.user.findFirst({ where: { phone, active: true, phoneVerified: true }, include: userInclude });
    if (!user) {
      const candidates = await prisma.user.findMany({ where: { phone, active: true }, include: userInclude, take: 2 });
      if (candidates.length === 1) user = candidates[0];
      else if (candidates.length > 1) throw conflict("This number is linked to more than one account. Sign in with email and verify your phone.");
    }
    if (!user) {
      if (!body.name) throw notFound("No account for this number yet. Send `name` (and `company` for suppliers) to create one.");
      if (body.role === "SUPPLIER" && !body.company) throw badRequest("Suppliers must provide company details");
      const email = `${phone.replace("+", "")}@phone.mysupplier.sa`;
      if (await prisma.user.findUnique({ where: { email } })) throw conflict("Account conflict, contact support");
      user = await prisma.user.create({
        data: {
          email, name: body.name, phone, phoneVerified: true, role: body.role, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
          companyRole: body.company ? "OWNER" : undefined,
          company: body.company ? { create: { ...body.company, type: body.role === "SUPPLIER" ? "SUPPLIER" : body.company.type, citiesServed: [body.company.city], branches: { create: { name: "Main branch", city: body.company.city, isDefault: true } } } } : undefined,
        },
        include: userInclude,
      });
    } else if (!user.phoneVerified) {
      user = await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, lastLoginAt: new Date() }, include: userInclude });
    } else {
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
    }
    const token = signToken({ id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name });
    res.json({ token, user: serialize(user) });
  }),
);

router.post(
  "/phone/verify",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { code, phone: raw } = z.object({ code: z.string().regex(/^\d{6}$/), phone: z.string().optional() }).parse(req.body);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const phone = normaliseSaudiPhone(raw ?? me.phone ?? "");
    if (!phone) throw badRequest("Add a valid Saudi mobile number to your profile first");
    await consumeCode(phone, "VERIFY_PHONE", code);
    const taken = await prisma.user.findFirst({ where: { phone, id: { not: me.id }, phoneVerified: true } });
    if (taken) throw conflict("This number is already verified on another account");
    const user = await prisma.user.update({ where: { id: me.id }, data: { phone, phoneVerified: true }, include: userInclude });
    res.json(serialize(user));
  }),
);

export default router;
