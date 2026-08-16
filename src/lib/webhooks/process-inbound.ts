import {
  type InboundWebhook,
  ProcessingStatus,
  WebhookSource,
} from "@prisma/client";

import { prisma } from "@/src/lib/prisma";
import { ingestEasyPostTrackerWebhook } from "@/src/lib/processors/tracking-event";

export async function processInboundWebhook(inbound: InboundWebhook) {
  if (inbound.source === WebhookSource.EASYPOST) {
    if (!inbound.payload) return;
    await ingestEasyPostTrackerWebhook(inbound.payload);
    return;
  }
  // Shopify webhooks are processed inline in handleShopifyWebhook and never
  // sit at PENDING, so the queue path is intentionally a no-op for them.
}

export async function drainPendingInboundWebhooks(limit = 25) {
  if (!prisma) {
    return { processed: 0, failed: 0 };
  }

  // Pick up brand-new webhooks and previously-failed ones that haven't
  // exhausted their retry budget, so a transient error doesn't permanently
  // drop a carrier event.
  const MAX_INBOUND_RETRIES = 5;
  const candidates = await prisma.inboundWebhook.findMany({
    where: {
      OR: [
        { status: ProcessingStatus.PENDING },
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
