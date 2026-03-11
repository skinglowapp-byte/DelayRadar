import { ProcessingStatus, WebhookSource } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";

import { prisma } from "@/src/lib/prisma";
import { ingestShopifyFulfillmentWebhook } from "@/src/lib/processors/shopify-fulfillment";
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
  const payload = safeJsonParse<unknown>(rawBody);

  if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json(
      { error: "Invalid Shopify webhook HMAC." },
      { status: 401 },
    );
  }

  const webhookId = request.headers.get("x-shopify-webhook-id");
  const idempotencyKey = webhookId ? `shopify:${webhookId}` : null;

  if (prisma && idempotencyKey) {
    const duplicate = await prisma.inboundWebhook.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (duplicate) {
      return new NextResponse(null, { status: 200 });
    }
  }

  const inbound = prisma
    ? await prisma.inboundWebhook.create({
        data: {
          source: WebhookSource.SHOPIFY,
          topic,
          shopDomain,
          idempotencyKey,
          headers: Object.fromEntries(request.headers.entries()),
          payload: (payload ?? {}) as object,
        },
      })
    : null;

  try {
    if (topic === "app/uninstalled" && prisma && shopDomain) {
      await prisma.shop.updateMany({
        where: { domain: shopDomain },
        data: {
          isInstalled: false,
          offlineAccessToken: null,
          uninstalledAt: new Date(),
        },
      });
    }

    if (
      (topic === "fulfillments/create" || topic === "fulfillments/update") &&
      shopDomain &&
      payload
    ) {
      await ingestShopifyFulfillmentWebhook(shopDomain, payload);
    }

    if (prisma && inbound) {
      await prisma.inboundWebhook.update({
        where: { id: inbound.id },
        data: {
          status: ProcessingStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (prisma && inbound) {
      await prisma.inboundWebhook.update({
        where: { id: inbound.id },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : "Webhook processing failed.",
        },
      });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Webhook processing failed.",
      },
      { status: 500 },
    );
  }
}
