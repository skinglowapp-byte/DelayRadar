import { WebhookSource } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";

import { prisma } from "@/src/lib/prisma";
import {
  readRawBody,
  verifyShopifyWebhookHmac,
} from "@/src/lib/shopify/webhooks";
import { safeJsonParse } from "@/src/lib/utils";

export async function POST(request: Request) {
  const rawBody = await readRawBody(request);
  const topic = request.headers.get("x-shopify-topic") ?? "unknown";
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json(
      { error: "Invalid Shopify webhook HMAC." },
      { status: 401 },
    );
  }

  const payload = safeJsonParse<unknown>(rawBody);
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const idempotencyKey = webhookId ? `shopify:${webhookId}` : null;

  if (!prisma) {
    return new NextResponse(null, { status: 200 });
  }

  if (idempotencyKey) {
    const duplicate = await prisma.inboundWebhook.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (duplicate) {
      return new NextResponse(null, { status: 200 });
    }
  }

  await prisma.inboundWebhook.create({
    data: {
      source: WebhookSource.SHOPIFY,
      topic,
      shopDomain,
      idempotencyKey,
      headers: Object.fromEntries(request.headers.entries()),
      payload: (payload ?? {}) as object,
    },
  });

  return new NextResponse(null, { status: 200 });
}
