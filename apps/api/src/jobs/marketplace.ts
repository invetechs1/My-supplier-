import { runPriceAlerts } from "../services/marketplace";
import { runRecurringOrders } from "../services/commerce";

/**
 * Marketplace background jobs. Cheap enough to run every hour on a single instance;
 * each job is idempotent (alerts deactivate once triggered, recurring orders advance nextRunAt).
 */
export async function runMarketplaceJobs() {
  const results: Record<string, unknown> = {};
  results.priceAlerts = await runPriceAlerts().catch((e) => ({ error: String(e) }));
  results.recurringOrders = await runRecurringOrders().catch((e) => ({ error: String(e) }));
  return results;
}

export function startMarketplaceJobs(everyMs = 60 * 60 * 1000) {
  const tick = () => runMarketplaceJobs().then((r) => console.log("[jobs] marketplace", JSON.stringify(r))).catch((e) => console.error("marketplace jobs failed", e));
  setTimeout(() => {
    tick();
    setInterval(tick, everyMs).unref();
  }, 90_000).unref();
}
