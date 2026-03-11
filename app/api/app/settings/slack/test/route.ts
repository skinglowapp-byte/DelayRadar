import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { sendSlackMessage } from "@/src/lib/notifications/slack";
import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const slackTestSchema = z.object({
  shop: z.string().optional(),
  webhookUrl: z.string().optional().default(""),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to test Slack delivery." },
      { status: 503 },
    );
  }

  try {
    const body = slackTestSchema.parse(await request.json());
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

    const webhookUrl =
      body.webhookUrl.trim() || shop.slackDestination?.webhookUrl?.trim() || null;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "Add a Slack webhook URL or save one in settings first." },
        { status: 400 },
      );
    }

    const text = [
      `DelayRadar Slack test for ${shop.shopName ?? shop.domain}`,
      "High-risk exception alerts and daily digests will land here once enabled.",
      "This is a test message only and is not logged against a shipment.",
    ].join("\n");

    await sendSlackMessage(webhookUrl, text);

    return NextResponse.json({
      ok: true,
      target: shop.slackDestination?.channelLabel?.trim() || "Slack webhook",
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Slack test delivery failed.",
      },
      { status },
    );
  }
}
