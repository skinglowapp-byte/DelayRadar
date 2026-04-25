import {
  type InboundWebhook,
  ProcessingStatus,
  WebhookSource,
} from "@prisma/client";

import { prisma } from "@/src/lib/prisma";
import { ingestShopifyFulfillmentWebhook } from "@/src/lib/processors/shopify-fulfillment";
import { ingestEasyPostTrackerWebhook } from "@/src/lib/processors/tracking-event";

async function applyShopifyEffects(inbound: InboundWebhook) {
  if (!prisma) return;
  const { topic, shopDomain, payload } = inbound;

  if (topic === "app/uninstalled" && shopDomain) {
    await prisma.shop.updateMany({
      where: { domain: shopDomain },
      data: {
        isInstalled: false,
        offlineAccessToken: null,
        uninstalledAt: new Date(),
      },
    });
    return;
  }

  if (topic === "customers/data_request") {
    return;
  }

  if (topic === "customers/redact" && shopDomain) {
    const redactPayload = payload as {
      customer?: { email?: string; phone?: string };
      orders_to_redact?: number[];
    };
    const customerEmail = redactPayload?.customer?.email;
    const customerPhone = redactPayload?.customer?.phone;
    const orderIds = (redactPayload?.orders_to_redact ?? []).map(String);

    const conditions: Array<Record<string, unknown>> = [];
    if (customerEmail) conditions.push({ customerEmail });
    if (customerPhone) conditions.push({ customerPhone });
    if (orderIds.length > 0) conditions.push({ shopifyOrderId: { in: orderIds } });

    if (conditions.length > 0) {
      const shopRecord = await prisma.shop.findUnique({
        where: { domain: shopDomain },
        select: { id: true },
      });
      if (shopRecord) {
        await prisma.shipment.updateMany({
          where: { shopId: shopRecord.id, OR: conditions },
          data: { customerName: null, customerEmail: null, customerPhone: null },
        });
      }
    }
    return;
  }

  if (topic === "shop/redact" && shopDomain) {
    const shopRecord = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });
    if (shopRecord) {
      await prisma.shop.delete({ where: { id: shopRecord.id } });
    }
    return;
  }

  if (
    (topic === "fulfillments/create" || topic === "fulfillments/update") &&
    shopDomain &&
    payload
  ) {
    await ingestShopifyFulfillmentWebhook(shopDomain, payload);
  }
}

async function applyEasyPostEffects(inbound: InboundWebhook) {
  if (!inbound.payload) return;
  await ingestEasyPostTrackerWebhook(inbound.payload);
}

export async function processInboundWebhook(inbound: InboundWebhook) {
  if (inbound.source === WebhookSource.SHOPIFY) {
    await applyShopifyEffects(inbound);
    return;
  }
  if (inbound.source === WebhookSource.EASYPOST) {
    await applyEasyPostEffects(inbound);
    return;
  }
}

export async function drainPendingInboundWebhooks(limit = 25) {
  if (!prisma) {
    return { processed: 0, failed: 0 };
  }

  const candidates = await prisma.inboundWebhook.findMany({
    where: { status: ProcessingStatus.PENDING },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      await processInboundWebhook(candidate);
      await prisma.inboundWebhook.update({
        where: { id: candidate.id },
        data: {
          status: ProcessingStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      await prisma.inboundWebhook.update({
        where: { id: candidate.id },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : "Webhook processing failed.",
          retryCount: { increment: 1 },
        },
      });
    }
  }

  return { processed, failed };
}
