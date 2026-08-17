import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { encrypt } from "@/src/lib/crypto";
import { verifyKlaviyoApiKey } from "@/src/lib/notifications/klaviyo";
import { prisma } from "@/src/lib/prisma";
import { requireShopDomain, routeErrorResponse } from "@/src/lib/shopify/route-helpers";

const klaviyoSettingsSchema = z.object({
  klaviyoEnabled: z.boolean(),
  // Omitted entirely when the merchant is only toggling the integration and
  // leaving the stored key alone — the key is never sent back to the browser,
  // so the form cannot round-trip it.
  klaviyoApiKey: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to save Klaviyo settings." },
      { status: 503 },
    );
  }

  try {
    const body = klaviyoSettingsSchema.parse(await request.json());
    const { shopDomain, response } = await requireShopDomain(request);

    if (response) {
      return response;
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true, klaviyoApiKey: true },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Connected shop not found." },
        { status: 404 },
      );
    }

    // An explicit empty string means "disconnect"; undefined means "unchanged".
    const clearing = body.klaviyoApiKey === "";
    const newKey = body.klaviyoApiKey ? body.klaviyoApiKey : null;

    if (body.klaviyoEnabled && !newKey && !shop.klaviyoApiKey) {
      return NextResponse.json(
        { error: "A Klaviyo private API key is required to enable the integration." },
        { status: 400 },
      );
    }

    // Reject a bad key at save time rather than discovering it later through
    // silently failed events on a real exception.
    if (newKey && !(await verifyKlaviyoApiKey(newKey))) {
      return NextResponse.json(
        { error: "Klaviyo rejected that API key. Check it and try again." },
        { status: 400 },
      );
    }

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        klaviyoEnabled: clearing ? false : body.klaviyoEnabled,
        ...(newKey ? { klaviyoApiKey: encrypt(newKey) } : {}),
        ...(clearing ? { klaviyoApiKey: null } : {}),
        // A newly saved key invalidates whatever the last failure said.
        ...(newKey || clearing ? { klaviyoLastError: null } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error, "Saving Klaviyo settings failed.");
  }
}
