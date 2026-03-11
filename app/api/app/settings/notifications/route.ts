import {
  NotificationChannel,
  type ExceptionType,
} from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { managedEmailRuleTypes } from "@/src/lib/notifications/managed-email-rules";
import { isActionNeededTriggerType } from "@/src/lib/notifications/message-mode";
import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const notificationSettingsSchema = z.object({
  shop: z.string().optional(),
  noMovementThresholdHours: z.number().int().min(24).max(240),
  emailRules: z.array(
    z.object({
      triggerType: z.enum(
        managedEmailRuleTypes as [string, ...string[]],
      ),
      active: z.boolean(),
    }),
  ),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to save notification settings." },
      { status: 503 },
    );
  }

  try {
    const body = notificationSettingsSchema.parse(await request.json());
    const requestShop = await resolveShopFromRequest(request);
    const shopDomain = requestShop ?? body.shop ?? null;

    if (!shopDomain) {
      return NextResponse.json({ error: "Shop is required." }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      include: {
        templates: {
          where: {
            channel: NotificationChannel.EMAIL,
          },
        },
      },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Connected shop not found." },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.shop.update({
        where: { id: shop.id },
        data: {
          noMovementThresholdHours: body.noMovementThresholdHours,
        },
      });

      for (const rule of body.emailRules) {
        const template =
          shop.templates.find(
            (entry) => entry.triggerType === rule.triggerType,
          ) ?? null;
        const onlyWhenActionRequired = isActionNeededTriggerType(
          rule.triggerType,
        );

        await tx.exceptionRule.upsert({
          where: {
            shopId_exceptionType_channel: {
              shopId: shop.id,
              exceptionType: rule.triggerType as ExceptionType,
              channel: NotificationChannel.EMAIL,
            },
          },
          update: {
            active: rule.active,
            templateId: template?.id ?? undefined,
            onlyWhenActionRequired,
          },
          create: {
            shopId: shop.id,
            exceptionType: rule.triggerType as ExceptionType,
            channel: NotificationChannel.EMAIL,
            active: rule.active,
            minRiskScore: 20,
            templateId: template?.id ?? null,
            onlyWhenActionRequired,
          },
        });

        if (template) {
          await tx.messageTemplate.update({
            where: { id: template.id },
            data: {
              active: rule.active,
            },
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Notification settings save failed.",
      },
      { status },
    );
  }
}
