/**
 * API key authentication for ERP integrations.
 *
 * Mount `apiKeyAuth()` once, before the routers (after express.json). When a request carries
 * `X-API-Key: msk_live_…` (or `Authorization: ApiKey msk_live_…`) the key is looked up by its sha256 hash,
 * revoked / expired keys are rejected, and req.user is populated from the key's creator with the key's company.
 * Requests without a key pass through untouched (JWT auth continues to work as before).
 * Key traffic gets its own rate limit (600 requests / minute per key).
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { badRequest, forbidden, unauthorized } from "../lib/errors";
import { extractApiKey, hasScope, hashApiKey, isApiKeyFormat, type ApiScope } from "../services/integrations";

export interface ApiKeyContext {
  id: string;
  name: string;
  companyId: string;
  scopes: ApiScope[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present when the request was authenticated with an API key. */
      apiKey?: ApiKeyContext;
    }
  }
}

declare module "./auth" {
  interface AuthUser {
    /** Company role assumed by API keys (always MANAGER) – real users resolve theirs from the database. */
    companyRole?: "OWNER" | "MANAGER" | "SALES" | "WAREHOUSE";
    apiKeyId?: string;
    apiKeyScopes?: ApiScope[];
  }
}

export const API_KEY_RATE_LIMIT = 600;
export const LAST_USED_THROTTLE_MS = 60_000;
const lastUsedWrites = new Map<string, number>();

/** Updates ApiKey.lastUsedAt at most once a minute per key (fire and forget). */
function touchLastUsed(keyId: string) {
  const now = Date.now();
  const last = lastUsedWrites.get(keyId) ?? 0;
  if (now - last < LAST_USED_THROTTLE_MS) return;
  lastUsedWrites.set(keyId, now);
  if (lastUsedWrites.size > 10_000) lastUsedWrites.clear(); // bound the memory of a long-running process
  void prisma.apiKey.update({ where: { id: keyId }, data: { lastUsedAt: new Date(now) } }).catch(() => undefined);
}

const keyLimiter = rateLimit({
  windowMs: 60_000,
  limit: API_KEY_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `apikey:${req.apiKey?.id ?? "anonymous"}`,
  message: { error: `API key rate limit exceeded (${API_KEY_RATE_LIMIT} requests per minute)` },
});

/** Resolves the key in the request (if any) and attaches req.apiKey + req.user. Throws 401 on a bad key. */
export async function authenticateApiKey(req: Request): Promise<ApiKeyContext | null> {
  const raw = extractApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!raw) return null;
  if (!isApiKeyFormat(raw)) throw unauthorized("Malformed API key");
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    include: { createdBy: { select: { id: true, email: true, name: true, role: true, active: true } } },
  });
  if (!key) throw unauthorized("Invalid API key");
  if (key.revokedAt) throw unauthorized("API key has been revoked");
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) throw unauthorized("API key has expired");
  if (!key.createdBy.active) throw unauthorized("The user who created this API key is disabled");

  const ctx: ApiKeyContext = { id: key.id, name: key.name, companyId: key.companyId, scopes: key.scopes as ApiScope[] };
  // A key always acts as its COMPANY (supplier or buyer), never as the platform admin who may have minted it.
  const company = await prisma.company.findUnique({ where: { id: key.companyId }, select: { type: true } });
  req.apiKey = ctx;
  req.user = {
    id: key.createdById,
    email: key.createdBy.email,
    name: `${key.createdBy.name} (API key: ${key.name})`,
    role: company?.type === "SUPPLIER" ? "SUPPLIER" : "BUYER",
    companyId: key.companyId,
    companyRole: "MANAGER",
    apiKeyId: key.id,
    apiKeyScopes: ctx.scopes,
  };
  touchLastUsed(key.id);
  return ctx;
}

/** Global middleware: authenticates API-key requests and applies the per-key rate limit to them. */
export function apiKeyAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    authenticateApiKey(req)
      .then((ctx) => {
        if (!ctx) return next();
        // One principal per request: a key and a bearer token together would split identity between them.
        if (typeof req.headers.authorization === "string" && req.headers.authorization.trim()) return next(badRequest("Send either an API key or a bearer token, not both"));
        // Keys are integration credentials: they never reach the interactive API (scopes only exist under /integrations).
        if (!/^\/api\/v1\/integrations(\/|$)/.test(req.path)) return next(forbidden("API keys may only call /api/v1/integrations endpoints; use a user session for everything else"));
        return keyLimiter(req, res, next);
      })
      .catch(next);
  };
}

/** Requires an API key carrying every listed scope. JWT-only callers get a 401 explaining how to authenticate. */
export function requireScope(...scopes: ApiScope[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.apiKey) {
      return next(unauthorized("This endpoint requires an API key. Send it as `X-API-Key: msk_live_…` (create one under Integrations → API keys)."));
    }
    if (!hasScope(req.apiKey.scopes, scopes)) {
      const err = forbidden(`API key is missing the required scope${scopes.length > 1 ? "s" : ""}: ${scopes.join(", ")}`);
      err.details = { required: scopes, granted: req.apiKey.scopes };
      return next(err);
    }
    next();
  };
}

/** Requires any valid API key (no particular scope). */
export const requireApiKey = () => requireScope();
