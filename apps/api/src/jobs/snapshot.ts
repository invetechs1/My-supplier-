import { prisma } from "../lib/prisma";
import { snapshotHistory } from "../services/catalog";
import { runAllFeeds } from "../services/catalogImport";
import { createUpdateRequest, outreachSuppliers } from "../routes/outreach";
import { notify } from "../services/notifications";

/** Snapshots daily price aggregates so the price index and charts have history. */
export async function runSnapshot() {
  const materials = await prisma.material.findMany({ where: { active: true }, select: { id: true } });
  await snapshotHistory(materials.map((m) => m.id));
  return materials.length;
}

/** Emails suppliers whose prices are stale (OUTREACH_AUTO=true). Runs at most once per 7 days. */
let lastOutreach = 0;
export async function runOutreach() {
  if (process.env.OUTREACH_AUTO !== "true") return 0;
  if (Date.now() - lastOutreach < 7 * 86400000) return 0;
  lastOutreach = Date.now();
  const stale = await outreachSuppliers(Number(process.env.OUTREACH_STALE_DAYS ?? 14));
  let sent = 0;
  for (const s of stale) {
    if (!s.contactEmail || s.pendingRequest) continue;
    await createUpdateRequest(s.company.id, "EMAIL").catch(() => undefined);
    sent++;
  }
  return sent;
}

/** Once a day, tell warehouse/owner users about listings at or below the company's low-stock threshold. */
export async function runLowStockAlerts() {
  const companies = await prisma.company.findMany({ where: { type: "SUPPLIER" }, select: { id: true, lowStockThreshold: true } });
  let alerts = 0;
  for (const c of companies) {
    const low = await prisma.priceListing.findMany({ where: { companyId: c.id, stock: { not: null, lte: c.lowStockThreshold } }, include: { material: { select: { name: true } } }, take: 20 });
    if (!low.length) continue;
    const users = await prisma.user.findMany({ where: { companyId: c.id, active: true, OR: [{ companyRole: { in: ["OWNER", "MANAGER", "WAREHOUSE"] } }, { companyRole: null }] }, select: { id: true } });
    await notify({ userIds: users.map((u) => u.id), type: "SYSTEM", title: `${low.length} item(s) low on stock`, body: low.slice(0, 5).map((l) => `${l.material.name} (${l.stock} left, ${l.city})`).join(" · "), link: "/supplier/inventory?lowStock=1" });
    alerts++;
  }
  return alerts;
}

export function startDailySnapshotJob() {
  const everyMs = 24 * 60 * 60 * 1000;
  const tick = () => {
    runAllFeeds()
      .catch((e) => console.error("feeds failed", e))
      .finally(() => runSnapshot().catch((e) => console.error("snapshot failed", e)))
      .finally(() => runOutreach().catch((e) => console.error("outreach failed", e)))
      .finally(() => runLowStockAlerts().catch((e) => console.error("low stock alerts failed", e)));
  };
  setTimeout(() => {
    tick();
    setInterval(tick, everyMs);
  }, 60_000).unref();
}
