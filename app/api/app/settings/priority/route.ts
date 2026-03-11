import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const prioritySettingsSchema = z.object({
  shop: z.string().optional(),
  priorityOrderValueThresholdCents: z.number().int().min(1000).max(5_000_000),
  vipTagPattern: z.string().trim().min(1).max(100),
  lostInTransitThresholdHours: z.number().int().min(48).max(720).optional(),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to save priority settings." },
      { status: 503 },
    );
  }

  try {
    const body = prioritySettingsSchema.parse(await request.json());
    const requestShop = await resolveShopFromRequest(request);
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

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        priorityOrderValueThresholdCents: body.priorityOrderValueThresholdCents,
        vipTagPattern: body.vipTagPattern,
        ...(typeof body.lostInTransitThresholdHours === "number"
          ? { lostInTransitThresholdHours: body.lostInTransitThresholdHours }
          : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Priority settings save failed.",
      },
      { status },
    );
  }
}
