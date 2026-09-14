import { Prisma } from "@prisma/client";

/**
 * Recursively converts Prisma Decimal -> number and Date -> ISO string so that
 * JSON responses match the shared TypeScript types.
 */
export function serialize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return Number(value) as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => serialize(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "passwordHash") continue;
      out[k] = serialize(v);
    }
    return out as T;
  }
  return value;
}
