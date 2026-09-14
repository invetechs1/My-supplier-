import { prisma } from "../lib/prisma";
import { snapshotHistory } from "../services/catalog";
import { runAllFeeds } from "../services/catalogImport";

/** Snapshots daily price aggregates so the price index and charts have history. */
export async function runSnapshot() {
  const materials = await prisma.material.findMany({ where: { active: true }, select: { id: true } });
  await snapshotHistory(materials.map((m) => m.id));
  return materials.length;
}

export function startDailySnapshotJob() {
  const everyMs = 24 * 60 * 60 * 1000;
  const tick = () => {
    runAllFeeds()
      .catch((e) => console.error("feeds failed", e))
      .finally(() => runSnapshot().catch((e) => console.error("snapshot failed", e)));
  };
  setTimeout(() => {
    tick();
    setInterval(tick, everyMs);
  }, 60_000).unref();
}
