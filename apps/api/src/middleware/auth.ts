import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  companyId: string | null;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

async function loadUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  // Download links (CSV, printable HTML, files) cannot send headers, so those GET routes may carry the JWT as ?token=.
  const queryToken = req.method === "GET" && typeof req.query.token === "string" && DOWNLOAD_ROUTE.test(req.path) ? req.query.token : null;
  if (!header?.startsWith("Bearer ") && !queryToken) return null;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken!;
  return userFromToken(token);
}

const DOWNLOAD_ROUTE = /\/(invoice\.html|delivery-note\.html|einvoice\.xml|export\.csv|statement\.csv|page|file)$/;

/** Verifies a JWT and loads the active user behind it (shared by header auth and download links). */
export async function userFromToken(token: string): Promise<AuthUser | null> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  } catch {
    return null;
  }
  if (!payload.sub) return null;
  const user = await prisma.user.findUnique({
    where: { id: String(payload.sub) },
    select: { id: true, email: true, role: true, companyId: true, name: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name };
}

/** Attaches req.user if a valid token is present; never fails. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadUser(req);
    if (user) req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(...roles: Role[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user ?? (await loadUser(req));
      if (!user) throw unauthorized();
      req.user = user;
      if (roles.length && !roles.includes(user.role)) throw forbidden(`Requires role ${roles.join(" or ")}`);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireCompany(req: Request): string {
  if (!req.user?.companyId) throw forbidden("This action requires a company profile");
  return req.user.companyId;
}
