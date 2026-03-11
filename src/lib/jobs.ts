import { JobStatus, JobType, type Prisma, type QueueJob } from "@prisma/client";

import { prisma } from "@/src/lib/prisma";

type JobPayload = Prisma.InputJsonObject;

export async function enqueueJob(input: {
  shopId?: string | null;
  shipmentId?: string | null;
  type: JobType;
  payload: JobPayload;
  availableAt?: Date;
}) {
  if (!prisma) {
    return null;
  }

  return prisma.queueJob.create({
    data: {
      shopId: input.shopId ?? null,
      shipmentId: input.shipmentId ?? null,
      type: input.type,
      payload: input.payload,
      availableAt: input.availableAt ?? new Date(),
    },
  });
}

export async function ensureDailyDigestJob(input: {
  shopId: string;
  availableAt?: Date;
  force?: boolean;
}) {
  if (!prisma) {
    return { job: null, alreadyQueued: false };
  }

  if (!input.force) {
    const existing = await prisma.queueJob.findFirst({
      where: {
        shopId: input.shopId,
        type: JobType.SEND_DAILY_DIGEST,
        status: {
          in: [JobStatus.PENDING, JobStatus.PROCESSING],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return { job: existing, alreadyQueued: true };
    }
  }

  const job = await enqueueJob({
    shopId: input.shopId,
    type: JobType.SEND_DAILY_DIGEST,
    payload: {
      shopId: input.shopId,
      force: Boolean(input.force),
    } satisfies Prisma.InputJsonObject,
    availableAt: input.availableAt,
  });

  return {
    job,
    alreadyQueued: false,
  };
}

export async function hasActiveJob(input: {
  shopId?: string;
  shipmentId?: string;
  type: JobType;
}) {
  if (!prisma) {
    return false;
  }

  const existing = await prisma.queueJob.findFirst({
    where: {
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.shipmentId ? { shipmentId: input.shipmentId } : {}),
      type: input.type,
      status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
    },
  });

  return Boolean(existing);
}

export async function claimAvailableJobs(limit = 10) {
  if (!prisma) {
    return [] as QueueJob[];
  }

  const candidates = await prisma.queueJob.findMany({
    where: {
      status: JobStatus.PENDING,
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const claimed: QueueJob[] = [];

  for (const candidate of candidates) {
    const result = await prisma.queueJob.updateMany({
      where: {
        id: candidate.id,
        status: JobStatus.PENDING,
      },
      data: {
        status: JobStatus.PROCESSING,
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    if (result.count === 1) {
      claimed.push({
        ...candidate,
        status: JobStatus.PROCESSING,
        attempts: candidate.attempts + 1,
        lockedAt: new Date(),
      });
    }
  }

  return claimed;
}

export async function completeJob(jobId: string) {
  if (!prisma) {
    return null;
  }

  return prisma.queueJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      processedAt: new Date(),
      lockedAt: null,
      lastError: null,
    },
  });
}

export async function rescheduleJob(job: QueueJob, error: unknown) {
  if (!prisma) {
    return null;
  }

  const message = error instanceof Error ? error.message : "Unknown worker error";
  const nextStatus = job.attempts >= 3 ? JobStatus.FAILED : JobStatus.PENDING;
  const retryDelayMinutes = Math.min(5 * job.attempts, 30);

  return prisma.queueJob.update({
    where: { id: job.id },
    data: {
      status: nextStatus,
      lastError: message,
      availableAt:
        nextStatus === JobStatus.PENDING
          ? new Date(Date.now() + retryDelayMinutes * 60_000)
          : new Date(),
      lockedAt: null,
    },
  });
}
