import { NextResponse } from "@/src/lib/next-response";

import { claimAvailableJobs, completeJob, rescheduleJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import { drainPendingInboundWebhooks } from "@/src/lib/webhooks/process-inbound";
import { processQueueJob } from "@/src/worker/process-job";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!prisma) {
    return NextResponse.json(
      { error: "No database connection." },
      { status: 503 },
    );
  }

  const inboundResult = await drainPendingInboundWebhooks(25);

  const stuckResetCount = await prisma.queueJob.updateMany({
    where: {
      status: "PROCESSING",
      lockedAt: { lte: new Date(Date.now() - 10 * 60_000) },
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      lastError: "Reset by cron: exceeded 10-minute processing lock.",
    },
  });

  const claimed = await claimAvailableJobs(10);

  let processedJobs = 0;
  let failedJobs = 0;
  for (const job of claimed) {
    try {
      await processQueueJob(job);
      await completeJob(job.id);
      processedJobs += 1;
    } catch (error) {
      failedJobs += 1;
      await rescheduleJob(job, error);
    }
  }

  const [pendingJobs, failedJobsTotal] = await Promise.all([
    prisma.queueJob.count({ where: { status: "PENDING" } }),
    prisma.queueJob.count({ where: { status: "FAILED" } }),
  ]);

  return NextResponse.json({
    inbound: inboundResult,
    jobs: {
      claimed: claimed.length,
      processed: processedJobs,
      failed: failedJobs,
      pending: pendingJobs,
      totalFailed: failedJobsTotal,
      stuckReset: stuckResetCount.count,
    },
    checkedAt: new Date().toISOString(),
  });
}
