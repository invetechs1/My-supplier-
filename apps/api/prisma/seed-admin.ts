/**
 * Creates (or resets) the platform administrator on a production database without touching anything else.
 *
 *   ADMIN_EMAIL=you@company.sa ADMIN_PASSWORD='strong-password' ADMIN_NAME='Your Name' pnpm --filter @mysupplier/api seed:admin
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: bcrypt.hashSync(password, 10), name: process.env.ADMIN_NAME ?? "Platform Admin", role: "ADMIN", locale: "ar" },
    update: { passwordHash: bcrypt.hashSync(password, 10), role: "ADMIN", active: true, tokenVersion: { increment: 1 } },
  });
  console.log(`Admin ready: ${user.email} (${user.name}). Any previous sessions for this account were signed out.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
