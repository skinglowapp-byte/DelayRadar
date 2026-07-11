import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { sendEmail } from "@/src/lib/notifications/email";
import { prisma } from "@/src/lib/prisma";
import { renderShipmentTemplate } from "@/src/lib/notifications/shipment-template";
import { requireShopDomain, routeErrorResponse } from "@/src/lib/shopify/route-helpers";
import { toHtmlBody } from "@/src/lib/utils";

const templateTestSchema = z.object({
  name: z.string().min(2),
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
  target: z.string().email().optional(),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to send template tests." },
      { status: 503 },
    );
  }

  try {
    const body = templateTestSchema.parse(await request.json());
    const { shopDomain, response } = await requireShopDomain(request);

    if (response) {
      return response;
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

    const target = body.target?.trim() || shop.email?.trim() || null;

    if (!target) {
      return NextResponse.json(
        { error: "Add a target email or set a shop contact email first." },
        { status: 400 },
      );
    }

    const sampleShipment = await prisma.shipment.findFirst({
      where: { shopId: shop.id },
      orderBy: [{ updatedAt: "desc" }],
    });

    const rendered = renderShipmentTemplate(
      {
        customerName: sampleShipment?.customerName ?? "Jordan Example",
        shopifyOrderName: sampleShipment?.shopifyOrderName ?? "#1045",
        trackingNumber: sampleShipment?.trackingNumber ?? "TRACK123456789",
        trackingCarrier: sampleShipment?.trackingCarrier ?? "the carrier",
        latestExceptionType: body.triggerType,
      },
      {
        name: body.name,
        subject: body.subject,
        body: body.body,
      },
    );

    const delivery = await sendEmail({
      to: target,
      subject: rendered.subject,
      textBody: rendered.body,
      htmlBody: toHtmlBody(rendered.body),
    });

    return NextResponse.json({
      ok: true,
      target,
      status: delivery.status,
      subject: rendered.subject,
      body: rendered.body,
    });
  } catch (error) {
    return routeErrorResponse(error, "Template test send failed.");
  }
}
