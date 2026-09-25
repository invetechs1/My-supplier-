import { createApp } from "./app";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";
import { startDailySnapshotJob } from "./jobs/snapshot";
import { startMarketplaceJobs } from "./jobs/marketplace";

async function main() {
  const app = createApp();
  await prisma.$connect();
  startDailySnapshotJob();
  startMarketplaceJobs();
  app.listen(env.port, () => {
    console.log(`MySupplier API listening on http://localhost:${env.port}/api/v1`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
