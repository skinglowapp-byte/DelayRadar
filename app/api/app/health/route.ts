import { NextResponse } from "@/src/lib/next-response";

import { prisma } from "@/src/lib/prisma";
import { requireShopDomain } from "@/src/lib/shopify/route-helpers";

export async function GET(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { status: "degraded", reason: "No database connection." },
      { status: 503 },
    );
  }

  // Health counts are shop-scoped and require a verified session token —
  // never expose platform-wide backlog/failure volume to anonymous callers.
  const { shopDomain, response } = await requireShopDomain(request);

  if (response) {
    return response;
  }

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return NextResponse.json(
      { error: "Connected shop not found." },
      { status: 404 },
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
      prisma.queueJob.count({
        where: { status: "PENDING", shopId: shop.id },
      }),
      prisma.queueJob.count({
        where: { status: "FAILED", shopId: shop.id },
      }),
      prisma.inboundWebhook.count({
        where: {
          status: "FAILED",
          shopId: shop.id,
          receivedAt: { gte: oneDayAgo },
        },
      }),
      prisma.notificationLog.count({
        where: {
          status: "FAILED",
          shopId: shop.id,
          createdAt: { gte: oneDayAgo },
        },
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
