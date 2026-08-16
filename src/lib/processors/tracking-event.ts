import {
  JobStatus,
  JobType,
  ShipmentStatus,
  type ExceptionType,
  type NotificationChannel,
  type Prisma,
} from "@prisma/client";

import {
  classifyEasyPostTrackerEvent,
  parseEasyPostTrackerEvent,
} from "@/src/lib/tracking/easypost";
import { enqueueJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";

function toShipmentStatus(
  value:
    | "PENDING"
    | "IN_TRANSIT"
    | "DELAYED"
    | "EXCEPTION"
    | "ACTION_REQUIRED"
    | "AVAILABLE_FOR_PICKUP"
    | "DELIVERED"
    | "LOST",
) {
  return value as ShipmentStatus;
}

function toExceptionType(
  value:
    | "DELAYED"
    | "FAILED_DELIVERY"
    | "ADDRESS_ISSUE"
    | "AVAILABLE_FOR_PICKUP"
    | "LOST_IN_TRANSIT"
    | "RETURN_TO_SENDER"
    | "OTHER"
    | null,
) {
  return value as ExceptionType | null;
}

function latestTrackingMessage(event: ReturnType<typeof parseEasyPostTrackerEvent>) {
  return event.result.tracking_details.at(-1)?.message ?? event.description;
}

export async function ingestEasyPostTrackerWebhook(payload: unknown) {
  if (!prisma) {
    return { processed: false };
  }

  const event = parseEasyPostTrackerEvent(payload);

  if (event.description !== "tracker.updated") {
    return { processed: false };
  }

  // Match by the globally-unique tracker id first. Only fall back to tracking
  // number — which is unique *per shop*, not globally — when it resolves to
  // exactly one shipment, so a reused carrier tracking code can never write
  // one tenant's event onto another tenant's shipment.
  let shipment = event.result.id
    ? await prisma.shipment.findUnique({
        where: { trackingProviderId: event.result.id },
      })
    : null;

  if (!shipment && event.result.tracking_code) {
    const matches = await prisma.shipment.findMany({
      where: { trackingNumber: event.result.tracking_code },
      take: 2,
    });

    if (matches.length === 1) {
      shipment = matches[0];
    } else if (matches.length > 1) {
      // Ambiguous across shops — refuse rather than guess and leak data.
      return { processed: false, reason: "ambiguous-tracking-number" };
    }
  }

  if (!shipment) {
    return { processed: false };
  }

  const classification = classifyEasyPostTrackerEvent(event);
  const latestCheckpoint = event.result.tracking_details.at(-1)?.datetime;
  const newCheckpointAt = latestCheckpoint ? new Date(latestCheckpoint) : null;
  const exceptionType = toExceptionType(classification.exceptionType);
  const normalizedStatus = toShipmentStatus(classification.normalizedStatus);

  // An event whose checkpoint predates the shipment's last known checkpoint is
  // an out-of-order delivery — record it in the timeline but don't let it
  // regress the shipment's live status.
  const isStale = Boolean(
    newCheckpointAt &&
      shipment.latestCheckpointAt &&
      newCheckpointAt < shipment.latestCheckpointAt,
  );

  await prisma.statusEvent.upsert({
    where: {
      providerEventId: event.id,
    },
    update: {
      normalizedStatus,
      exceptionType,
      message: latestTrackingMessage(event),
      actionRequired: classification.actionRequired,
      raw: payload as Prisma.InputJsonValue,
      occurredAt: newCheckpointAt ?? new Date(),
    },
    create: {
      shipmentId: shipment.id,
      providerEventId: event.id,
      normalizedStatus,
      exceptionType,
      message: latestTrackingMessage(event),
      actionRequired: classification.actionRequired,
      raw: payload as Prisma.InputJsonValue,
      occurredAt: newCheckpointAt ?? new Date(),
    },
  });

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      trackingProviderId: event.result.id ?? shipment.trackingProviderId,
      trackingCarrier: event.result.carrier ?? shipment.trackingCarrier,
      // Only advance live status for the newest checkpoint we've seen.
      latestStatus: isStale ? undefined : normalizedStatus,
      latestExceptionType: isStale ? undefined : exceptionType,
      // Only move the no-movement clock when the event carries a real
      // checkpoint — an empty tracking_details must not look like fresh motion.
      latestCheckpointAt: isStale ? undefined : newCheckpointAt ?? undefined,
      deliveredAt:
        !isStale && normalizedStatus === ShipmentStatus.DELIVERED
          ? newCheckpointAt ?? new Date()
          : undefined,
      riskScore: isStale ? undefined : classification.riskScore,
      actionRequired: isStale ? undefined : classification.actionRequired,
    },
  });

  if (!isStale && exceptionType && exceptionType !== shipment.latestExceptionType) {
    // Avoid enqueuing a second notification job while one is still pending or
    // processing for this shipment — reduces duplicate customer emails / Slack
    // alerts when several tracker events land close together.
    const activeJob = await prisma.queueJob.findFirst({
      where: {
        shipmentId: shipment.id,
        type: JobType.DELIVER_EXCEPTION_NOTIFICATION,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
      select: { id: true },
    });

    if (!activeJob) {
      await enqueueJob({
        shopId: shipment.shopId,
        shipmentId: shipment.id,
        type: JobType.DELIVER_EXCEPTION_NOTIFICATION,
        payload: {
          shipmentId: shipment.id,
          exceptionType,
          preferredChannel: "EMAIL" satisfies NotificationChannel,
        } satisfies Prisma.InputJsonObject,
      });
    }
  }

  return { processed: true };
}
