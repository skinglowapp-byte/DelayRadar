import { NextResponse } from "@/src/lib/next-response";

import { scheduleDueDigests } from "@/src/lib/digest/schedule-due";
import { sweepNoMovementShipments } from "@/src/lib/processors/no-movement-sweep";
import { prisma } from "@/src/lib/prisma";
import { isAuthorizedCron } from "@/src/lib/utils";
import { drainPendingInboundWebhooks } from "@/src/lib/webhooks/process-inbound";
import { runJobBatch } from "@/src/worker/run-batch";

export const maxDuration = 60;

// Leave headroom under maxDuration so in-flight work can finish and the
// response can flush before Vercel kills the function.
const TIME_BUDGET_MS = 50_000;

// Retention: how long to keep terminal records before pruning them. Bounds
// unbounded QueueJob / InboundWebhook growth and PII lifetime.
const COMPLETED_JOB_RETENTION_DAYS = 14;
const PROCESSED_WEBHOOK_RETENTION_DAYS = 30;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!prisma) {
    return NextResponse.json(
      { error: "No database connection." },
      { status: 503 },
    );
  }

  const deadline = Date.now() + TIME_BUDGET_MS;

  // Auto-unsnooze: return exceptions whose snooze has elapsed to the OPEN
  // inbox so they aren't hidden forever.
  await prisma.shipment.updateMany({
    where: {
      workflowState: "SNOOZED",
      snoozedUntil: { lte: new Date() },
    },
    data: { workflowState: "OPEN", snoozedUntil: null },
  });

  // Recover jobs stranded in PROCESSING by a prior timeout before draining.
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

  // Promote quiet shipments into NO_MOVEMENT exceptions (and enqueue their
  // notifications) before draining, so those alerts go out in this same run.
  const noMovement = await sweepNoMovementShipments();

  // Drain the entire inbound + job backlog within the time budget rather than a
  // single fixed batch, so throughput is bounded by wall-clock, not by a hard
  // per-run cap. (Alert *latency* is still bounded by the cron cadence — see
  // vercel.json — which is the remaining infra/cost decision.)
  const inbound = { processed: 0, failed: 0 };
  while (Date.now() < deadline) {
    const result = await drainPendingInboundWebhooks(50);
    inbound.processed += result.processed;
    inbound.failed += result.failed;
    if (result.processed + result.failed === 0) break;
  }

  const jobs = { claimed: 0, processed: 0, failed: 0 };
  while (Date.now() < deadline) {
    const batch = await runJobBatch(25);
    jobs.claimed += batch.claimed;
    jobs.processed += batch.processed;
    jobs.failed += batch.failed;
    if (batch.claimed === 0) break;
  }

  // Schedule any due daily digests (folded in here so Hobby needs only the two
  // worker crons, not a separate digests cron).
  const digests = await scheduleDueDigests();

  // Prune terminal records so the tables and their indexes don't grow forever.
  const jobRetentionCutoff = new Date(
    Date.now() - COMPLETED_JOB_RETENTION_DAYS * 24 * 3600_000,
  );
  const webhookRetentionCutoff = new Date(
    Date.now() - PROCESSED_WEBHOOK_RETENTION_DAYS * 24 * 3600_000,
  );
  const [prunedJobs, prunedWebhooks] = await Promise.all([
    prisma.queueJob.deleteMany({
      where: { status: "COMPLETED", processedAt: { lte: jobRetentionCutoff } },
    }),
    prisma.inboundWebhook.deleteMany({
      where: {
        status: "PROCESSED",
        processedAt: { lte: webhookRetentionCutoff },
      },
    }),
  ]);

  const [pendingJobs, failedJobsTotal] = await Promise.all([
    prisma.queueJob.count({ where: { status: "PENDING" } }),
    prisma.queueJob.count({ where: { status: "FAILED" } }),
  ]);

  return NextResponse.json({
    inbound,
    jobs: {
      ...jobs,
      pending: pendingJobs,
      totalFailed: failedJobsTotal,
      stuckReset: stuckResetCount.count,
    },
    noMovement,
    digests,
    pruned: { jobs: prunedJobs.count, webhooks: prunedWebhooks.count },
    checkedAt: new Date().toISOString(),
  });
}
