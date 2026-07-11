import { prisma } from "@/src/lib/prisma";
import { drainPendingInboundWebhooks } from "@/src/lib/webhooks/process-inbound";
import { runJobBatch } from "@/src/worker/run-batch";

async function main() {
  if (!prisma) {
    console.error("DATABASE_URL is not configured.");
    process.exitCode = 1;
    return;
  }

  const inboundResult = await drainPendingInboundWebhooks(25);
  if (inboundResult.processed > 0 || inboundResult.failed > 0) {
    console.log(
      `Inbound webhooks: ${inboundResult.processed} processed, ${inboundResult.failed} failed.`,
    );
  }

  const { claimed, processed, failed } = await runJobBatch(10);

  if (claimed === 0) {
    console.log("No pending DelayRadar jobs.");
    return;
  }

  console.log(`Jobs: ${processed} processed, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
