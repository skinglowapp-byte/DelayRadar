import {
  ExceptionType,
  NotificationChannel,
} from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { managedSlackRuleTypes } from "@/src/lib/notifications/managed-slack-rules";
import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const slackSchema = z.object({
  shop: z.string().optional(),
  webhookUrl: z.string().optional().default(""),
  clearWebhook: z.boolean().optional().default(false),
  digestHour: z.number().int().min(0).max(23),
  notifyHighRiskOnly: z.boolean(),
  slackRules: z.array(
    z.object({
      triggerType: z.enum(
        managedSlackRuleTypes as [string, ...string[]],
      ),
      active: z.boolean(),
    }),
  ),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to save Slack settings." },
      { status: 503 },
    );
  }

  try {
    const body = slackSchema.parse(await request.json());
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

    await prisma.$transaction(async (tx) => {
      for (const rule of body.slackRules) {
        await tx.exceptionRule.upsert({
          where: {
            shopId_exceptionType_channel: {
              shopId: shop.id,
              exceptionType: rule.triggerType as ExceptionType,
              channel: NotificationChannel.SLACK,
            },
          },
          update: {
            active: rule.active,
            minRiskScore: 70,
            onlyWhenActionRequired: true,
          },
          create: {
            shopId: shop.id,
            exceptionType: rule.triggerType as ExceptionType,
            channel: NotificationChannel.SLACK,
            active: rule.active,
            minRiskScore: 70,
            onlyWhenActionRequired: true,
          },
        });
      }

      if (body.clearWebhook) {
        await tx.slackDestination.deleteMany({
          where: { shopId: shop.id },
        });

        return;
      }

      const trimmedWebhookUrl = body.webhookUrl.trim();

      if (trimmedWebhookUrl) {
        await tx.slackDestination.upsert({
          where: { shopId: shop.id },
          update: {
            webhookUrl: trimmedWebhookUrl,
            dailyDigestHour: body.digestHour,
            notifyHighRiskOnly: body.notifyHighRiskOnly,
          },
          create: {
            shopId: shop.id,
            webhookUrl: trimmedWebhookUrl,
            dailyDigestHour: body.digestHour,
            notifyHighRiskOnly: body.notifyHighRiskOnly,
          },
        });

        return;
      }

      if (shop.slackDestination) {
        await tx.slackDestination.update({
          where: { shopId: shop.id },
          data: {
            dailyDigestHour: body.digestHour,
            notifyHighRiskOnly: body.notifyHighRiskOnly,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      cleared: body.clearWebhook,
      configured: Boolean(body.webhookUrl.trim() || shop.slackDestination),
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Slack settings save failed.",
      },
      { status },
    );
  }
}
