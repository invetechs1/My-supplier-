import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, signToken } from "../middleware/auth";
import { badRequest, conflict, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";

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
        company: body.company
          ? { create: { ...body.company, type: body.role === "SUPPLIER" ? "SUPPLIER" : body.company.type } }
          : undefined,
      },
      include: userInclude,
    });
    const token = signToken({ id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name });
    res.status(201).json({ token, user: serialize(user) });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: userInclude });
    if (!user || !user.active) throw unauthorized("Invalid email or password");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized("Invalid email or password");
    const token = signToken({ id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name });
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
    const user = await prisma.user.update({ where: { id: req.user!.id }, data, include: userInclude });
    res.json(serialize(user));
  }),
);

export default router;
