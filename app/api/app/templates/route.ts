import { NotificationChannel, type ExceptionType } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { isActionNeededTriggerType } from "@/src/lib/notifications/message-mode";
import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const templateSchema = z.object({
  shop: z.string().optional(),
  name: z.string().min(2),
  channel: z.nativeEnum(NotificationChannel),
  triggerType: z.enum([
    "DELAYED",
    "FAILED_DELIVERY",
    "ADDRESS_ISSUE",
    "AVAILABLE_FOR_PICKUP",
    "LOST_IN_TRANSIT",
    "RETURN_TO_SENDER",
    "OTHER",
  ]),
  subject: z.string().max(160),
  body: z.string().min(20),
  active: z.boolean(),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to save templates." },
      { status: 503 },
    );
  }

  try {
    const body = templateSchema.parse(await request.json());
    const requestShop = await resolveShopFromRequest(request, { requireJwt: true });
    const shopDomain = requestShop ?? body.shop ?? null;

    if (!shopDomain) {
      return NextResponse.json({ error: "Shop is required." }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Connected shop not found." },
        { status: 404 },
      );
    }

    const template = await prisma.messageTemplate.upsert({
      where: {
        shopId_channel_triggerType: {
          shopId: shop.id,
          channel: body.channel,
          triggerType: body.triggerType as ExceptionType,
        },
      },
      update: {
        name: body.name,
        subject: body.subject,
        body: body.body,
        active: body.active,
      },
      create: {
        shopId: shop.id,
        name: body.name,
        channel: body.channel,
        triggerType: body.triggerType as ExceptionType,
        subject: body.subject,
        body: body.body,
        active: body.active,
      },
    });

    await prisma.exceptionRule.upsert({
      where: {
        shopId_exceptionType_channel: {
          shopId: shop.id,
          exceptionType: body.triggerType as ExceptionType,
          channel: body.channel,
        },
      },
      update: {
        templateId: template.id,
        active: body.active,
        onlyWhenActionRequired: isActionNeededTriggerType(body.triggerType),
      },
      create: {
        shopId: shop.id,
        exceptionType: body.triggerType as ExceptionType,
        channel: body.channel,
        active: body.active,
        templateId: template.id,
        onlyWhenActionRequired: isActionNeededTriggerType(body.triggerType),
      },
    });

    return NextResponse.json({ ok: true, templateId: template.id });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Template save failed.",
      },
      { status },
    );
  }
}
