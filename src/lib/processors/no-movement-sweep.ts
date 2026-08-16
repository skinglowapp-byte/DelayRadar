import {
  ExceptionType,
  JobStatus,
  JobType,
  NotificationChannel,
  ShipmentStatus,
  type Prisma,
} from "@prisma/client";

import { enqueueJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import {
  checkpointDate,
  DEFAULT_NO_MOVEMENT_THRESHOLD_HOURS,
  noMovementRiskScore,
} from "@/src/lib/shipment-helpers";

// Cap per run so one shop can't dominate the worker's time budget.
const MAX_SHOPS_PER_SWEEP = 200;
const MAX_SHIPMENTS_PER_SHOP = 100;

/**
 * Promote shipments that have gone quiet past a shop's no-movement threshold
 * into first-class NO_MOVEMENT exceptions and enqueue a notification. Before
 * this, "no movement" existed only as a read-time computation and in the
 * digest — it never produced an email/Slack alert.
 */
export async function sweepNoMovementShipments() {
  if (!prisma) {
    return { marked: 0, notified: 0 };
  }

  const shops = await prisma.shop.findMany({
    where: { isInstalled: true },
    select: { id: true, noMovementThresholdHours: true },
    take: MAX_SHOPS_PER_SWEEP,
  });

  let marked = 0;
  let notified = 0;

  for (const shop of shops) {
    const thresholdHours =
      shop.noMovementThresholdHours ?? DEFAULT_NO_MOVEMENT_THRESHOLD_HOURS;
    const staleThresholdAt = new Date(Date.now() - thresholdHours * 3600_000);

    const stale = await prisma.shipment.findMany({
      where: {
        shopId: shop.id,
        trackingProviderId: { not: null },
        latestExceptionType: null,
        latestStatus: {
          in: [ShipmentStatus.PENDING, ShipmentStatus.IN_TRANSIT],
        },
        OR: [
          { latestCheckpointAt: { lte: staleThresholdAt } },
          {
            latestCheckpointAt: null,
            updatedAt: { lte: staleThresholdAt },
          },
        ],
      },
      take: MAX_SHIPMENTS_PER_SHOP,
    });

    for (const shipment of stale) {
      const checkpointAt = checkpointDate(shipment);
      const ageHours = (Date.now() - checkpointAt.getTime()) / 3600_000;
      const riskScore = Math.max(
        shipment.riskScore,
        noMovementRiskScore(ageHours, thresholdHours),
      );

      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          latestExceptionType: ExceptionType.NO_MOVEMENT,
          riskScore,
        },
      });
      marked += 1;

      // Dedup: don't stack notification jobs for the same shipment.
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
          shopId: shop.id,
          shipmentId: shipment.id,
          type: JobType.DELIVER_EXCEPTION_NOTIFICATION,
          payload: {
            shipmentId: shipment.id,
            exceptionType: ExceptionType.NO_MOVEMENT,
            preferredChannel: "EMAIL" satisfies NotificationChannel,
          } satisfies Prisma.InputJsonObject,
        });
        notified += 1;
      }
    }
  }

  return { marked, notified };
}
