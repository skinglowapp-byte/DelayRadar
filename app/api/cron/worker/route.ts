import { NextResponse } from "@/src/lib/next-response";

import { prisma } from "@/src/lib/prisma";

export const maxDuration = 10;

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

  const [pendingJobs, failedJobs, stuckJobs] = await Promise.all([
    prisma.queueJob.count({ where: { status: "PENDING" } }),
    prisma.queueJob.count({ where: { status: "FAILED" } }),
    prisma.queueJob.count({
      where: {
        status: "PROCESSING",
        lockedAt: { lte: new Date(Date.now() - 10 * 60_000) },
      },
    }),
  ]);

  // Unstick jobs that have been processing for more than 10 minutes
  if (stuckJobs > 0) {
    await prisma.queueJob.updateMany({
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
  }

  return NextResponse.json({
    pendingJobs,
    failedJobs,
    stuckJobsReset: stuckJobs,
    checkedAt: new Date().toISOString(),
  });
}
