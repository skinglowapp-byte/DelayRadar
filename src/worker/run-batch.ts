import { claimAvailableJobs, completeJob, rescheduleJob } from "@/src/lib/jobs";
import { processQueueJob } from "@/src/worker/process-job";

export async function runJobBatch(limit: number) {
  const claimed = await claimAvailableJobs(limit);

  const results = await Promise.allSettled(
    claimed.map(async (job) => {
      try {
        await processQueueJob(job);
        await completeJob(job.id);
        return { ok: true as const };
      } catch (error) {
        await rescheduleJob(job, error);
        return { ok: false as const, error };
      }
    }),
  );

  let processed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.ok) {
      processed++;
    } else {
      failed++;
    }
  }

  return { claimed: claimed.length, processed, failed };
}
