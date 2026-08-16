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
  const eventId = typeof epPayload?.id === "string" ? epPayload.id : null;
  const idempotencyKey = eventId ? `easypost:${eventId}` : null;

  if (!prisma) {
    // Signal failure so EasyPost retries rather than silently dropping the
    // event — a 200 here would discard the tracking update forever.
    return NextResponse.json(
      { error: "Database unavailable." },
      { status: 503 },
    );
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
      externalId: eventId,
      idempotencyKey,
      // Don't retain the HMAC signature headers — they're spent after
      // verification and are needless secret retention.
      headers: {
        "content-type": request.headers.get("content-type") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      payload: (payload ?? {}) as object,
    },
  });

  return new NextResponse(null, { status: 200 });
}
