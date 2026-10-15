import {
  type InboundWebhook,
  ProcessingStatus,
  WebhookSource,
} from "@prisma/client";

import { prisma } from "@/src/lib/prisma";
import { ingestEasyPostTrackerWebhook } from "@/src/lib/processors/tracking-event";
import { dispatchShopifyTopic } from "@/src/lib/webhooks/shopify-dispatch";

export async function processInboundWebhook(inbound: InboundWebhook) {
  if (inbound.source === WebhookSource.EASYPOST) {
    if (!inbound.payload) return;
    await ingestEasyPostTrackerWebhook(inbound.payload);
    return;
  }
  if (inbound.source === WebhookSource.SHOPIFY) {
    // Normally processed right after the delivery is acknowledged; this path
    // picks up deliveries whose first attempt failed or never ran.
    if (!inbound.shopDomain) {
      throw new Error("Shopify webhook row has no shop domain.");
    }
    await dispatchShopifyTopic(inbound.topic.toLowerCase(), {
      shop: inbound.shopDomain,
      payload: inbound.payload,
    });
  }
}

export async function drainPendingInboundWebhooks(limit = 25) {
  if (!prisma) {
    return { processed: 0, failed: 0 };
  }

  // Pick up brand-new webhooks and previously-failed ones that haven't
  // exhausted their retry budget, so a transient error doesn't permanently
  // drop a carrier event.
  const MAX_INBOUND_RETRIES = 5;
  const SHOPIFY_HANDOFF_GRACE_MS = 2 * 60_000;
  const candidates = await prisma.inboundWebhook.findMany({
    where: {
      OR: [
        { status: ProcessingStatus.PENDING, source: WebhookSource.EASYPOST },
        // A fresh Shopify row is still being handled by the request that
        // acknowledged it (waitUntil); only take it over once that has had
        // ample time to finish or die.
        {
          status: ProcessingStatus.PENDING,
          source: WebhookSource.SHOPIFY,
          receivedAt: { lt: new Date(Date.now() - SHOPIFY_HANDOFF_GRACE_MS) },
        },
        {
          status: ProcessingStatus.FAILED,
          retryCount: { lt: MAX_INBOUND_RETRIES },
        },
      ],
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      await processInboundWebhook(candidate);
      await prisma.inboundWebhook.updateMany({
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
      await prisma.inboundWebhook.updateMany({
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
