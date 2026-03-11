import {
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

  const shipment = await prisma.shipment.findFirst({
    where: {
      OR: [
        event.result.id ? { trackingProviderId: event.result.id } : undefined,
        { trackingNumber: event.result.tracking_code },
      ].filter(Boolean) as Prisma.ShipmentWhereInput[],
    },
  });

  if (!shipment) {
    return { processed: false };
  }

  const classification = classifyEasyPostTrackerEvent(event);
  const latestCheckpoint = event.result.tracking_details.at(-1)?.datetime;
  const exceptionType = toExceptionType(classification.exceptionType);
  const normalizedStatus = toShipmentStatus(classification.normalizedStatus);

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
      occurredAt: latestCheckpoint ? new Date(latestCheckpoint) : new Date(),
    },
    create: {
      shipmentId: shipment.id,
      providerEventId: event.id,
      normalizedStatus,
      exceptionType,
      message: latestTrackingMessage(event),
      actionRequired: classification.actionRequired,
      raw: payload as Prisma.InputJsonValue,
      occurredAt: latestCheckpoint ? new Date(latestCheckpoint) : new Date(),
    },
  });

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      trackingProviderId: event.result.id ?? shipment.trackingProviderId,
      trackingCarrier: event.result.carrier ?? shipment.trackingCarrier,
      latestStatus: normalizedStatus,
      latestExceptionType: exceptionType,
      latestCheckpointAt: latestCheckpoint ? new Date(latestCheckpoint) : new Date(),
      deliveredAt:
        normalizedStatus === ShipmentStatus.DELIVERED
          ? (latestCheckpoint ? new Date(latestCheckpoint) : new Date())
          : undefined,
      riskScore: classification.riskScore,
      actionRequired: classification.actionRequired,
    },
  });

  if (exceptionType) {
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

  return { processed: true };
}
