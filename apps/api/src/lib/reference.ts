import { prisma } from "./prisma";

/** Generates human readable references like RFQ-2026-000123 using an atomic counter. */
export async function nextReference(prefix: "RFQ" | "ORD"): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}
