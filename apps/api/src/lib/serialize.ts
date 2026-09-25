import { Prisma } from "@prisma/client";

/** Fields that must never leave the API unless the caller owns the record (or is an admin). */
const PRIVATE_KEYS = new Set(["passwordHash", "iban", "bankName", "beneficiary", "commissionPct", "verificationNotes", "tokenHash", "codeHash", "rawText", "keyHash", "secret"]);

/**
 * Recursively converts Prisma Decimal -> number and Date -> ISO string so that
 * JSON responses match the shared TypeScript types. Private fields are removed
 * unless `includePrivate` is set (owner / admin responses only).
 */
export function serialize<T>(value: T, opts: { includePrivate?: boolean } = {}): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return Number(value) as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => serialize(v, opts)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "passwordHash") continue;
      if (!opts.includePrivate && PRIVATE_KEYS.has(k)) continue;
      out[k] = serialize(v, opts);
    }
    return out as T;
  }
  return value;
}
