import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { sendEmail } from "@/src/lib/notifications/email";
import { renderShipmentTemplate } from "@/src/lib/notifications/shipment-template";
import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";
import { toHtmlBody } from "@/src/lib/utils";

const manualNotificationSchema = z.object({
  shop: z.string().optional(),
  shipmentId: z.string().min(1),
  templateId: z.string().min(1),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to send manual notifications." },
      { status: 503 },
    );
  }

  try {
    const body = manualNotificationSchema.parse(await request.json());
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

    const shipment = await prisma.shipment.findFirst({
      where: {
        id: body.shipmentId,
        shopId: shop.id,
      },
    });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found for this shop." },
        { status: 404 },
      );
    }

    if (!shipment.customerEmail?.trim()) {
      return NextResponse.json(
        { error: "This shipment does not have a customer email address." },
        { status: 400 },
      );
    }

    const template = await prisma.messageTemplate.findFirst({
      where: {
        id: body.templateId,
        shopId: shop.id,
        channel: NotificationChannel.EMAIL,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Email template not found for this shop." },
        { status: 404 },
      );
    }

    const rendered = renderShipmentTemplate(shipment, template);

    try {
      const delivery = await sendEmail({
        to: shipment.customerEmail,
        subject: rendered.subject,
        textBody: rendered.body,
        htmlBody: toHtmlBody(rendered.body),
      });

      const now = new Date();
      const notification = await prisma.$transaction(async (tx) => {
        const log = await tx.notificationLog.create({
          data: {
            shopId: shop.id,
            shipmentId: shipment.id,
            templateId: template.id,
            channel: NotificationChannel.EMAIL,
            target: shipment.customerEmail,
            status:
              delivery.status === "sent"
                ? NotificationDeliveryStatus.SENT
                : NotificationDeliveryStatus.SKIPPED,
            subject: rendered.subject,
            body: rendered.body,
            externalMessageId: delivery.externalMessageId,
            sentAt: delivery.status === "sent" ? now : null,
          },
        });

        if (delivery.status === "sent") {
          await tx.shipment.update({
            where: { id: shipment.id },
            data: { lastNotifiedAt: now },
          });
        }

        return log;
      });

      return NextResponse.json({
        ok: true,
        notificationId: notification.id,
        status: delivery.status,
        target: shipment.customerEmail,
      });
    } catch (error) {
      const notification = await prisma.notificationLog.create({
        data: {
          shopId: shop.id,
          shipmentId: shipment.id,
          templateId: template.id,
          channel: NotificationChannel.EMAIL,
          target: shipment.customerEmail,
          status: NotificationDeliveryStatus.FAILED,
          subject: rendered.subject,
          body: rendered.body,
          errorMessage:
            error instanceof Error ? error.message : "Email delivery failed.",
        },
      });

      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Email delivery failed.",
          notificationId: notification.id,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Manual notification send failed.",
      },
      { status },
    );
  }
}
