/**
 * Phase 0 house supplier "MySupplier Direct": the highest-demand Riyadh products with list prices,
 * sold and delivered by the MySupplier team until third-party suppliers list.
 *
 *   HOUSE_SUPPLIER_PASSWORD='…' HOUSE_SUPPLIER_PHONE='+9665…' HOUSE_SUPPLIER_EMAIL='ops@…' \
 *     pnpm --filter @mysupplier/api seed:house
 *
 * Idempotent: re-running refreshes prices and validity (30 days). The product list and prices live
 * in prisma/seed-data/house-top200.ts; photos are added by `pnpm catalog:launch`.
 */
import { PrismaClient } from "@prisma/client";
import { seedHouse } from "./house-seed-lib";

const prisma = new PrismaClient();

seedHouse(prisma)
  .then((r) => {
    console.log(`House supplier ready: ${r.materialsCreated} products created, ${r.listingsCreated} listings created, ${r.listingsUpdated} refreshed, valid until ${r.validUntil.toISOString().slice(0, 10)}.`);
    console.log(`Ops login: ${r.email}${r.password ? ` / generated password: ${r.password} (change it after first login)` : ""}`);
  })
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
