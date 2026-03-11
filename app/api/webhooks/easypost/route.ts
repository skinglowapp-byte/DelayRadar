import { ProcessingStatus, WebhookSource } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";

import { prisma } from "@/src/lib/prisma";
import { ingestEasyPostTrackerWebhook } from "@/src/lib/processors/tracking-event";
import {
  verifyEasyPostWebhookSignature,
} from "@/src/lib/tracking/easypost";
import { safeJsonParse } from "@/src/lib/utils";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = safeJsonParse<unknown>(rawBody);

  if (!verifyEasyPostWebhookSignature(request, rawBody)) {
    return NextResponse.json(
      { error: "Invalid EasyPost webhook signature." },
      { status: 401 },
    );
  }

  const epPayload = payload as Record<string, unknown> | null;
  const epResult = epPayload?.result as Record<string, unknown> | undefined;
  const trackerId = typeof epResult?.id === "string" ? epResult.id : null;
  const trackerStatus = typeof epResult?.status === "string" ? epResult.status : null;
  const idempotencyKey =
    trackerId && trackerStatus ? `easypost:${trackerId}:${trackerStatus}` : null;

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
          source: WebhookSource.EASYPOST,
          topic: "tracker.updated",
          idempotencyKey,
          headers: Object.fromEntries(request.headers.entries()),
          payload: (payload ?? {}) as object,
        },
      })
    : null;

  try {
    if (payload) {
      await ingestEasyPostTrackerWebhook(payload);
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
