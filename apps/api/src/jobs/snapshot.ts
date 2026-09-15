import { prisma } from "../lib/prisma";
import { snapshotHistory } from "../services/catalog";
import { runAllFeeds } from "../services/catalogImport";
import { createUpdateRequest, outreachSuppliers } from "../routes/outreach";

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

export function startDailySnapshotJob() {
  const everyMs = 24 * 60 * 60 * 1000;
  const tick = () => {
    runAllFeeds()
      .catch((e) => console.error("feeds failed", e))
      .finally(() => runSnapshot().catch((e) => console.error("snapshot failed", e)))
      .finally(() => runOutreach().catch((e) => console.error("outreach failed", e)));
  };
  setTimeout(() => {
    tick();
    setInterval(tick, everyMs);
  }, 60_000).unref();
}
