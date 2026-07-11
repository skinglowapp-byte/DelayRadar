import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { ensureDailyDigestJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import { requireShopDomain, routeErrorResponse } from "@/src/lib/shopify/route-helpers";

const digestSchema = z.object({
  force: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to queue daily digests." },
      { status: 503 },
    );
  }

  try {
    const body = digestSchema.parse(await request.json());
    const { shopDomain, response } = await requireShopDomain(request);

    if (response) {
      return response;
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      include: {
        slackDestination: true,
      },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Connected shop not found." },
        { status: 404 },
      );
    }

    if (!shop.slackDestination?.webhookUrl) {
      return NextResponse.json(
        { error: "Save a Slack destination before queueing a digest." },
        { status: 400 },
      );
    }

    if (!body.force) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const sentToday = await prisma.notificationLog.findFirst({
        where: {
          shopId: shop.id,
          shipmentId: null,
          channel: NotificationChannel.SLACK,
          status: NotificationDeliveryStatus.SENT,
          subject: "DelayRadar daily digest",
          sentAt: {
            gte: startOfDay,
          },
        },
      });

      if (sentToday) {
        return NextResponse.json({
          ok: true,
          jobId: null,
          alreadyQueued: false,
          alreadySentToday: true,
        });
      }
    }

    const result = await ensureDailyDigestJob({
      shopId: shop.id,
      force: body.force,
    });

    return NextResponse.json({
      ok: true,
      jobId: result.job?.id ?? null,
      alreadyQueued: result.alreadyQueued,
      alreadySentToday: false,
    });
  } catch (error) {
    return routeErrorResponse(error, "Unable to queue the digest.");
  }
}
