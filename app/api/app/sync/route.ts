import { JobType, type Prisma } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { enqueueJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const syncSchema = z.object({
  shop: z.string().optional(),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to queue a sync." },
      { status: 503 },
    );
  }

  try {
    const body = syncSchema.parse(await request.json());
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

    await enqueueJob({
      shopId: shop.id,
      type: JobType.BACKFILL_SHIPMENTS,
      payload: {
        shopId: shop.id,
      } satisfies Prisma.InputJsonObject,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Sync queueing failed.",
      },
      { status },
    );
  }
}
