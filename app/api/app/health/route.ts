import { NextResponse } from "@/src/lib/next-response";

import { prisma } from "@/src/lib/prisma";

export async function GET() {
  if (!prisma) {
    return NextResponse.json(
      { status: "degraded", reason: "No database connection." },
      { status: 503 },
    );
  }

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 3600000);

    const [
      workerBacklog,
      workerFailed,
      webhookFailures,
      notificationFailures,
    ] = await Promise.all([
      prisma.queueJob.count({ where: { status: "PENDING" } }),
      prisma.queueJob.count({ where: { status: "FAILED" } }),
      prisma.inboundWebhook.count({
        where: { status: "FAILED", receivedAt: { gte: oneDayAgo } },
      }),
      prisma.notificationLog.count({
        where: { status: "FAILED", createdAt: { gte: oneDayAgo } },
      }),
    ]);

    const healthy =
      workerFailed === 0 && webhookFailures === 0 && notificationFailures === 0;

    return NextResponse.json({
      status: healthy ? "healthy" : "degraded",
      workerBacklog,
      workerFailed,
      webhookFailures24h: webhookFailures,
      notificationFailures24h: notificationFailures,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "unhealthy", reason: "Health check query failed." },
      { status: 500 },
    );
  }
}
