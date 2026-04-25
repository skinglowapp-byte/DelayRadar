import { WebhookSource } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";

import { prisma } from "@/src/lib/prisma";
import { verifyEasyPostWebhookSignature } from "@/src/lib/tracking/easypost";
import { safeJsonParse } from "@/src/lib/utils";

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyEasyPostWebhookSignature(request, rawBody)) {
    return NextResponse.json(
      { error: "Invalid EasyPost webhook signature." },
      { status: 401 },
    );
  }

  const payload = safeJsonParse<unknown>(rawBody);
  const epPayload = payload as Record<string, unknown> | null;
  const epResult = epPayload?.result as Record<string, unknown> | undefined;
  const trackerId = typeof epResult?.id === "string" ? epResult.id : null;
  const trackerStatus = typeof epResult?.status === "string" ? epResult.status : null;
  const idempotencyKey =
    trackerId && trackerStatus ? `easypost:${trackerId}:${trackerStatus}` : null;

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
      source: WebhookSource.EASYPOST,
      topic: "tracker.updated",
      idempotencyKey,
      headers: Object.fromEntries(request.headers.entries()),
      payload: (payload ?? {}) as object,
    },
  });

  return new NextResponse(null, { status: 200 });
}
