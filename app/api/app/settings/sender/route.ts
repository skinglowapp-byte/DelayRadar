import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { prisma } from "@/src/lib/prisma";
import { requireShopDomain, routeErrorResponse } from "@/src/lib/shopify/route-helpers";

const emailField = z
  .string()
  .trim()
  .email()
  .max(320)
  .optional()
  .or(z.literal(""));

const senderSettingsSchema = z.object({
  senderName: z.string().trim().max(120).optional().or(z.literal("")),
  senderEmail: emailField,
  replyToEmail: emailField,
  digestEmailEnabled: z.boolean(),
  digestEmailRecipient: emailField,
  emailDigestHour: z.number().int().min(0).max(23),
});

function normalizeEmail(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to save sender settings." },
      { status: 503 },
    );
  }

  try {
    const body = senderSettingsSchema.parse(await request.json());
    const { shopDomain, response } = await requireShopDomain(request);

    if (response) {
      return response;
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true, senderEmail: true, senderVerified: true },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Connected shop not found." },
        { status: 404 },
      );
    }

    const senderEmail = normalizeEmail(body.senderEmail);

    // Changing the custom From address always resets verification — the app
    // owner must verify the new address/domain with the email provider before
    // it can be used as From. Until then, sends fall back to the shared domain
    // with this address as Reply-To.
    const senderVerified =
      senderEmail && senderEmail === shop.senderEmail ? shop.senderVerified : false;

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        senderName: body.senderName?.trim() || null,
        senderEmail,
        senderVerified,
        replyToEmail: normalizeEmail(body.replyToEmail),
        digestEmailEnabled: body.digestEmailEnabled,
        digestEmailRecipient: normalizeEmail(body.digestEmailRecipient),
        digestHour: body.emailDigestHour,
      },
    });

    return NextResponse.json({ ok: true, senderVerified });
  } catch (error) {
    return routeErrorResponse(error, "Sender settings save failed.");
  }
}
