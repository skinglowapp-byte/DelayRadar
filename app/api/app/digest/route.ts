import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { ensureDailyDigestJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const digestSchema = z.object({
  shop: z.string().optional(),
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
    const requestShop = await resolveShopFromRequest(request);
    const shopDomain = requestShop ?? body.shop ?? null;

    if (!shopDomain) {
      return NextResponse.json({ error: "Shop is required." }, { status: 400 });
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
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Unable to queue the digest.",
      },
      { status },
    );
  }
}
