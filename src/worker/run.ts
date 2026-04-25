import { claimAvailableJobs, completeJob, rescheduleJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import { drainPendingInboundWebhooks } from "@/src/lib/webhooks/process-inbound";
import { processQueueJob } from "@/src/worker/process-job";

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

  const jobs = await claimAvailableJobs(10);

  if (jobs.length === 0) {
    console.log("No pending DelayRadar jobs.");
    return;
  }

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        await processQueueJob(job);
        await completeJob(job.id);
      } catch (error) {
        console.error(`Job ${job.id} failed`, error);
        await rescheduleJob(job, error);
      }
    }),
  );

  const failures = results.filter((r) => r.status === "rejected");

  if (failures.length > 0) {
    console.error(`${failures.length} job(s) failed unexpectedly.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
