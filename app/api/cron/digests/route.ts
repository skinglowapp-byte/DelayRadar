import { NextResponse } from "@/src/lib/next-response";

import { nextDigestRunAt, normalizeTimeZone } from "@/src/lib/digest/schedule";
import { ensureDailyDigestJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to schedule digests." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized cron invocation." },
      { status: 401 },
    );
  }

  const shops = await prisma.shop.findMany({
    where: {
      isInstalled: true,
      slackDestination: {
        isNot: null,
      },
    },
    include: {
      slackDestination: true,
    },
  });

  let scheduledCount = 0;
  let alreadyQueuedCount = 0;

  for (const shop of shops) {
    if (!shop.slackDestination?.webhookUrl.trim()) {
      continue;
    }

    const availableAt = nextDigestRunAt({
      timeZone: normalizeTimeZone(shop.timezone),
      digestHour: shop.slackDestination.dailyDigestHour,
    });
    const result = await ensureDailyDigestJob({
      shopId: shop.id,
      availableAt,
    });

    if (result.alreadyQueued) {
      alreadyQueuedCount += 1;
      continue;
    }

    scheduledCount += 1;
  }

  return NextResponse.json({
    ok: true,
    shopsConsidered: shops.length,
    scheduledCount,
    alreadyQueuedCount,
  });
}
