import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { prisma } from "@/src/lib/prisma";
import { effectivePrioritySettings, planFeaturesFor } from "@/src/lib/plans";
import { planGateResponse } from "@/src/lib/shopify/plan-gate";
import { requireShopDomain, routeErrorResponse } from "@/src/lib/shopify/route-helpers";

const prioritySettingsSchema = z.object({
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

    // The lost-in-transit window is on every plan; the VIP tag and order-value
    // rules are Pro+. The Free dashboard shows the defaults, so re-saving them
    // is allowed (the shared settings form still works) and leaves any values
    // stored from a paid plan untouched for when the shop upgrades again.
    const features = planFeaturesFor(shop.planName);
    const effective = effectivePrioritySettings(features, shop);
    const changesPriorityRules =
      body.priorityOrderValueThresholdCents !==
        effective.priorityOrderValueThresholdCents ||
      body.vipTagPattern !== effective.vipTagPattern;

    if (changesPriorityRules) {
      const gate = planGateResponse(shop, "priorityRules");
      if (gate) {
        return gate;
      }
    }

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        ...(features.priorityRules
          ? {
              priorityOrderValueThresholdCents: body.priorityOrderValueThresholdCents,
              vipTagPattern: body.vipTagPattern,
            }
          : {}),
        ...(typeof body.lostInTransitThresholdHours === "number"
          ? { lostInTransitThresholdHours: body.lostInTransitThresholdHours }
          : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error, "Priority settings save failed.");
  }
}
