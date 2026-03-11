import {
  JobType,
  NotificationChannel,
  NotificationDeliveryStatus,
  ShipmentStatus,
} from "@prisma/client";

import { claimAvailableJobs, completeJob, rescheduleJob } from "@/src/lib/jobs";
import { sendEmail } from "@/src/lib/notifications/email";
import { renderShipmentTemplate } from "@/src/lib/notifications/shipment-template";
import { sendSlackMessage } from "@/src/lib/notifications/slack";
import { evaluateShipmentPriority } from "@/src/lib/priority/shipment-priority";
import { backfillRecentShipments } from "@/src/lib/processors/shopify-fulfillment";
import { prisma } from "@/src/lib/prisma";
import { createEasyPostTracker } from "@/src/lib/tracking/easypost";
import {
  checkpointDate,
  DEFAULT_NO_MOVEMENT_THRESHOLD_HOURS,
  noMovementRiskScore,
} from "@/src/lib/shipment-helpers";
import { formatDateTime, titleize, toHtmlBody } from "@/src/lib/utils";

async function hasSentShipmentNotification(input: {
  shipmentId: string;
  channel: NotificationChannel;
  since: Date;
  subject?: string;
  templateId?: string;
}) {
  if (!prisma) {
    return false;
  }

  const notification = await prisma.notificationLog.findFirst({
    where: {
      shipmentId: input.shipmentId,
      channel: input.channel,
      status: NotificationDeliveryStatus.SENT,
      sentAt: {
        gte: input.since,
      },
      subject: input.subject,
      templateId: input.templateId,
    },
  });

  return Boolean(notification);
}

function slackTarget(channelLabel: string | null | undefined) {
  return channelLabel?.trim() || "Slack ops channel";
}

async function processCreateTrackerJob(jobId: string, shipmentId: string) {
  if (!prisma) {
    return;
  }

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
  });

  if (!shipment || shipment.trackingProviderId) {
    return;
  }

  const tracker = await createEasyPostTracker({
    trackingCode: shipment.trackingNumber,
    carrier: shipment.trackingCarrier,
  });

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      trackingProviderId: tracker.id,
      trackingCarrier: tracker.carrier ?? shipment.trackingCarrier,
    },
  });

  console.log(`Tracker created for shipment ${shipment.id} via job ${jobId}`);
}

async function processNotificationJob(shipmentId: string) {
  if (!prisma) {
    return;
  }

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      shop: {
        include: {
          slackDestination: true,
          templates: true,
          exceptionRules: true,
        },
      },
    },
  });

  if (!shipment || !shipment.latestExceptionType) {
    return;
  }

  const checkpointAt = checkpointDate(shipment);
  const priority = evaluateShipmentPriority({
    baseRiskScore: shipment.riskScore,
    orderValueCents: shipment.orderValueCents,
    orderTags: shipment.orderTags,
    shippingMethodLabel: shipment.shippingMethodLabel,
    priorityOrderValueThresholdCents:
      shipment.shop.priorityOrderValueThresholdCents ?? 15000,
    vipTagPattern: shipment.shop.vipTagPattern ?? "vip",
    currencyCode: shipment.shop.currencyCode ?? "USD",
  });

  const emailRule =
    shipment.shop.exceptionRules.find(
      (entry) =>
        entry.exceptionType === shipment.latestExceptionType &&
        entry.channel === NotificationChannel.EMAIL,
    ) ?? null;

  const shouldSendEmail =
    emailRule?.active &&
    shipment.riskScore >= emailRule.minRiskScore &&
    (!emailRule.onlyWhenActionRequired || shipment.actionRequired);

  const template =
    shipment.shop.templates.find((entry) => {
      if (!entry.active || entry.channel !== NotificationChannel.EMAIL) {
        return false;
      }

      if (emailRule?.templateId) {
        return entry.id === emailRule.templateId;
      }

      return entry.triggerType === shipment.latestExceptionType;
    }) ?? null;

  if (shouldSendEmail && template && shipment.customerEmail) {
    const alreadySent = await hasSentShipmentNotification({
      shipmentId: shipment.id,
      channel: NotificationChannel.EMAIL,
      since: checkpointAt,
      templateId: template.id,
    });

    if (!alreadySent) {
      const { subject, body } = renderShipmentTemplate(shipment, template);

      try {
        const delivery = await sendEmail({
          to: shipment.customerEmail,
          subject,
          textBody: body,
          htmlBody: toHtmlBody(body),
        });

        await prisma.notificationLog.create({
          data: {
            shopId: shipment.shopId,
            shipmentId: shipment.id,
            templateId: template.id,
            channel: NotificationChannel.EMAIL,
            target: shipment.customerEmail,
            status:
              delivery.status === "sent"
                ? NotificationDeliveryStatus.SENT
                : NotificationDeliveryStatus.SKIPPED,
            subject,
            body,
            externalMessageId: delivery.externalMessageId,
            sentAt: delivery.status === "sent" ? new Date() : null,
          },
        });

        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            lastNotifiedAt: new Date(),
          },
        });
      } catch (error) {
        await prisma.notificationLog.create({
          data: {
            shopId: shipment.shopId,
            shipmentId: shipment.id,
            templateId: template.id,
            channel: NotificationChannel.EMAIL,
            target: shipment.customerEmail,
            status: NotificationDeliveryStatus.FAILED,
            subject,
            body,
            errorMessage:
              error instanceof Error ? error.message : "Email delivery failed.",
          },
        });

        throw error;
      }
    }
  }

  const slackRule =
    shipment.shop.exceptionRules.find(
      (entry) =>
        entry.exceptionType === shipment.latestExceptionType &&
        entry.channel === NotificationChannel.SLACK,
    ) ?? null;
  const slackRiskThreshold = shipment.shop.slackDestination?.notifyHighRiskOnly
    ? Math.max(slackRule?.minRiskScore ?? 0, 70)
    : (slackRule?.minRiskScore ?? 0);
  const shouldSendSlack =
    Boolean(shipment.shop.slackDestination?.webhookUrl) &&
    Boolean(slackRule?.active) &&
    priority.effectiveRiskScore >= slackRiskThreshold &&
    (!slackRule?.onlyWhenActionRequired || shipment.actionRequired);

  if (shouldSendSlack && shipment.shop.slackDestination?.webhookUrl) {
    const subject = `Slack alert: ${titleize(shipment.latestExceptionType)}`;
    const alreadySent = await hasSentShipmentNotification({
      shipmentId: shipment.id,
      channel: NotificationChannel.SLACK,
      since: checkpointAt,
      subject,
    });

    if (alreadySent) {
      return;
    }

    const text = [
      `DelayRadar alert for ${shipment.shop.shopName ?? shipment.shop.domain}`,
      `Order: ${shipment.shopifyOrderName ?? shipment.trackingNumber}`,
      `Exception: ${titleize(shipment.latestExceptionType)}`,
      `Tracking: ${shipment.trackingNumber}`,
      `Risk score: ${priority.effectiveRiskScore} (carrier ${shipment.riskScore})`,
      `Priority: ${priority.priorityLabel}`,
      `Last checkpoint: ${formatDateTime(shipment.latestCheckpointAt)}`,
      shipment.actionRequired
        ? "Action: Customer follow-up is likely required"
        : "Action: Monitor and keep the customer informed",
      ...priority.priorityReasons.map((reason) => `Priority reason: ${reason}`),
    ].join("\n");

    try {
      await sendSlackMessage(shipment.shop.slackDestination.webhookUrl, text);

      await prisma.notificationLog.create({
        data: {
          shopId: shipment.shopId,
          shipmentId: shipment.id,
          channel: NotificationChannel.SLACK,
          target: slackTarget(shipment.shop.slackDestination.channelLabel),
          status: NotificationDeliveryStatus.SENT,
          subject,
          body: text,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.notificationLog.create({
        data: {
          shopId: shipment.shopId,
          shipmentId: shipment.id,
          channel: NotificationChannel.SLACK,
          target: slackTarget(shipment.shop.slackDestination.channelLabel),
          status: NotificationDeliveryStatus.FAILED,
          subject,
          body: text,
          errorMessage:
            error instanceof Error ? error.message : "Slack delivery failed.",
        },
      });
    }
  }
}

async function processDailyDigestJob(input: {
  shopId: string;
  force: boolean;
}) {
  if (!prisma) {
    return;
  }

  const shop = await prisma.shop.findUnique({
    where: { id: input.shopId },
    include: {
      slackDestination: true,
    },
  });

  if (!shop?.slackDestination?.webhookUrl) {
    return;
  }

  if (!input.force) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const existingDigest = await prisma.notificationLog.findFirst({
      where: {
        shopId: shop.id,
        shipmentId: null,
        channel: NotificationChannel.SLACK,
        status: NotificationDeliveryStatus.SENT,
        subject: "DelayRadar daily digest",
        sentAt: {
          gte: startOfDay,
        },
      },
    });

    if (existingDigest) {
      return;
    }
  }

  const noMovementThresholdHours =
    shop.noMovementThresholdHours ?? DEFAULT_NO_MOVEMENT_THRESHOLD_HOURS;
  const priorityOrderValueThresholdCents =
    shop.priorityOrderValueThresholdCents ?? 15000;
  const vipTagPattern = shop.vipTagPattern ?? "vip";
  const currencyCode = shop.currencyCode ?? "USD";
  const staleThresholdAt = new Date(
    Date.now() - noMovementThresholdHours * 3600000,
  );
  const [explicitExceptions, staleCandidates] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        shopId: shop.id,
        latestExceptionType: { not: null },
        latestStatus: {
          not: ShipmentStatus.DELIVERED,
        },
        ...(shop.slackDestination.notifyHighRiskOnly
          ? {
              riskScore: {
                gte: 70,
              },
            }
          : {}),
      },
      orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
      take: 10,
    }),
    prisma.shipment.findMany({
      where: {
        shopId: shop.id,
        trackingProviderId: { not: null },
        latestExceptionType: null,
        latestStatus: {
          in: [ShipmentStatus.PENDING, ShipmentStatus.IN_TRANSIT],
        },
        OR: [
          {
            latestCheckpointAt: {
              lte: staleThresholdAt,
            },
          },
          {
            latestCheckpointAt: null,
            updatedAt: {
              lte: staleThresholdAt,
            },
          },
        ],
      },
      orderBy: [{ updatedAt: "asc" }],
      take: 10,
    }),
  ]);

  const digestEntries = [
    ...explicitExceptions.map((shipment) => ({
      ...evaluateShipmentPriority({
        baseRiskScore: shipment.riskScore,
        orderValueCents: shipment.orderValueCents,
        orderTags: shipment.orderTags,
        shippingMethodLabel: shipment.shippingMethodLabel,
        priorityOrderValueThresholdCents,
        vipTagPattern,
        currencyCode,
      }),
      id: shipment.id,
      orderLabel: shipment.shopifyOrderName ?? shipment.trackingNumber,
      exceptionLabel: titleize(shipment.latestExceptionType ?? "OTHER"),
      riskScore: shipment.riskScore,
      actionRequired: shipment.actionRequired,
      lastCheckpointAt: checkpointDate(shipment),
    })),
    ...staleCandidates.map((shipment) => {
      const checkpointAt = checkpointDate(shipment);
      const ageHours = (Date.now() - checkpointAt.getTime()) / 3600000;
      const baseRiskScore = Math.max(
        shipment.riskScore,
        noMovementRiskScore(ageHours, noMovementThresholdHours),
      );
      const evaluatedPriority = evaluateShipmentPriority({
        baseRiskScore,
        orderValueCents: shipment.orderValueCents,
        orderTags: shipment.orderTags,
        shippingMethodLabel: shipment.shippingMethodLabel,
        priorityOrderValueThresholdCents,
        vipTagPattern,
        currencyCode,
      });

      return {
        ...evaluatedPriority,
        id: shipment.id,
        orderLabel: shipment.shopifyOrderName ?? shipment.trackingNumber,
        exceptionLabel: "No Tracking Movement",
        riskScore: baseRiskScore,
        actionRequired: false,
        lastCheckpointAt: checkpointAt,
      };
    }),
  ]
    .sort((left, right) => {
      if (right.effectiveRiskScore !== left.effectiveRiskScore) {
        return right.effectiveRiskScore - left.effectiveRiskScore;
      }

      return (
        right.lastCheckpointAt.getTime() - left.lastCheckpointAt.getTime()
      );
    })
    .slice(0, 10);

  if (digestEntries.length === 0) {
    return;
  }

  const lines = digestEntries.map((shipment) =>
    [
      `• ${shipment.orderLabel}`,
      `${shipment.exceptionLabel}`,
      `Risk ${shipment.effectiveRiskScore} (carrier ${shipment.riskScore})`,
      shipment.priorityLabel !== "Standard"
        ? `Priority ${shipment.priorityLabel}`
        : null,
      shipment.actionRequired ? "Customer action needed" : null,
      `Last checkpoint ${formatDateTime(shipment.lastCheckpointAt)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const digestText = [
    `DelayRadar daily digest for ${shop.shopName ?? shop.domain}`,
    `Open exceptions: ${digestEntries.length} · Action needed: ${
      digestEntries.filter((entry) => entry.actionRequired).length
    } · No-movement: ${
      digestEntries.filter(
        (entry) => entry.exceptionLabel === "No Tracking Movement",
      ).length
    }`,
    ...lines,
  ].join("\n");

  try {
    await sendSlackMessage(shop.slackDestination.webhookUrl, digestText);

    await prisma.notificationLog.create({
      data: {
        shopId: shop.id,
        channel: NotificationChannel.SLACK,
        target: slackTarget(shop.slackDestination.channelLabel),
        status: NotificationDeliveryStatus.SENT,
        subject: "DelayRadar daily digest",
        body: digestText,
        sentAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.notificationLog.create({
      data: {
        shopId: shop.id,
        channel: NotificationChannel.SLACK,
        target: slackTarget(shop.slackDestination.channelLabel),
        status: NotificationDeliveryStatus.FAILED,
        subject: "DelayRadar daily digest",
        body: digestText,
        errorMessage:
          error instanceof Error ? error.message : "Slack digest delivery failed.",
      },
    });

    throw error;
  }
}

async function processJob(job: Awaited<ReturnType<typeof claimAvailableJobs>>[number]) {
  const payload = job.payload as Record<string, unknown>;

  switch (job.type) {
    case JobType.CREATE_TRACKER: {
      const shipmentId = String(payload.shipmentId ?? "");
      await processCreateTrackerJob(job.id, shipmentId);
      return;
    }
    case JobType.DELIVER_EXCEPTION_NOTIFICATION: {
      const shipmentId = String(payload.shipmentId ?? "");
      await processNotificationJob(shipmentId);
      return;
    }
    case JobType.BACKFILL_SHIPMENTS: {
      const shopId = String(payload.shopId ?? job.shopId ?? "");
      await backfillRecentShipments(shopId);
      return;
    }
    case JobType.SEND_DAILY_DIGEST: {
      const shopId = String(payload.shopId ?? job.shopId ?? "");
      await processDailyDigestJob({
        shopId,
        force: Boolean(payload.force),
      });
      return;
    }
    default: {
      throw new Error(`Unsupported job type ${job.type}`);
    }
  }
}

async function main() {
  if (!prisma) {
    console.error("DATABASE_URL is not configured.");
    process.exitCode = 1;
    return;
  }

  const jobs = await claimAvailableJobs(10);

  if (jobs.length === 0) {
    console.log("No pending DelayRadar jobs.");
    return;
  }

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        await processJob(job);
        await completeJob(job.id);
      } catch (error) {
        console.error(`Job ${job.id} failed`, error);
        await rescheduleJob(job, error);
      }
    }),
  );

  const failures = results.filter((r) => r.status === "rejected");

  if (failures.length > 0) {
    console.error(`${failures.length} job(s) failed unexpectedly.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
