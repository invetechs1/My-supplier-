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

/** Session token. `tv` (token version) lets logout, password change and role change revoke every earlier token. */
export function signToken(user: AuthUser & { tokenVersion?: number }): string {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion ?? 0 }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

/**
 * Short-lived, single-purpose token for links that cannot carry an Authorization header (printable
 * invoices, CSV exports, private files). It is bound to one API path and expires in 60 seconds, so a
 * copied link, a browser history entry or an access log never yields a usable session.
 */
export const DOWNLOAD_TOKEN_TTL_SECONDS = 60;
export function signDownloadToken(userId: string, path: string, tokenVersion = 0): string {
  return jwt.sign({ sub: userId, dl: path, tv: tokenVersion }, env.jwtSecret, { expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS });
}

async function loadUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  // Download links (CSV, printable HTML, files) cannot send headers, so those GET routes may carry a download token as ?token=.
  const queryToken = req.method === "GET" && typeof req.query.token === "string" && DOWNLOAD_ROUTE.test(req.path) ? req.query.token : null;
  if (header?.startsWith("Bearer ")) return userFromToken(header.slice(7));
  if (queryToken) return userFromToken(queryToken, { downloadPath: downloadPathOf(req.path) });
  return null;
}

/** Download tokens are bound to the API path without the version prefix (what clients request). */
export const downloadPathOf = (p: string) => p.replace(/^\/api\/v1(?=\/)/, "");
const DOWNLOAD_ROUTE = /\/(invoice\.html|delivery-note\.html|einvoice\.xml|export\.csv|statement\.csv|page|file)$/;

/**
 * Verifies a JWT and loads the active user behind it. Session tokens are accepted only in the
 * Authorization header; download tokens (payload.dl) only as ?token= on exactly the path they were
 * issued for. Tokens whose `tv` no longer matches the user's tokenVersion are revoked.
 */
export async function userFromToken(token: string, opts: { downloadPath?: string } = {}): Promise<AuthUser | null> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  } catch {
    return null;
  }
  if (!payload.sub) return null;
  const dl = typeof payload.dl === "string" ? payload.dl : null;
  if (opts.downloadPath) {
    if (!dl || dl !== opts.downloadPath) return null; // session tokens never work from a URL
  } else if (dl) {
    return null; // download tokens never work as a session
  }
  const user = await prisma.user.findUnique({
    where: { id: String(payload.sub) },
    select: { id: true, email: true, role: true, companyId: true, name: true, active: true, tokenVersion: true },
  });
  if (!user || !user.active) return null;
  if ((typeof payload.tv === "number" ? payload.tv : 0) !== user.tokenVersion) return null;
  return { id: user.id, email: user.email, role: user.role, companyId: user.companyId, name: user.name };
}

/** Invalidates every token issued so far for a user (logout everywhere, password or role change). */
export async function revokeUserTokens(userId: string): Promise<number> {
  const u = await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } }, select: { tokenVersion: true } });
  return u.tokenVersion;
}

/** Attaches req.user if a valid token is present; never fails. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  if ((req as Request & { apiKey?: unknown }).apiKey) return next(); // API-key principal already resolved
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
