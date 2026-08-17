import {
  JobType,
  NotificationChannel,
  NotificationDeliveryStatus,
  ShipmentStatus,
} from "@prisma/client";

import type { QueueJob } from "@prisma/client";

import { sendEmail, shopEmailSender } from "@/src/lib/notifications/email";
import { renderShipmentTemplate } from "@/src/lib/notifications/shipment-template";
import { sendSlackMessage } from "@/src/lib/notifications/slack";
import { startOfLocalDay } from "@/src/lib/digest/schedule";
import { evaluateShipmentPriority } from "@/src/lib/priority/shipment-priority";
import {
  allowanceWindowStart,
  monthlyShipmentLimitFor,
  OVER_ALLOWANCE_REASON,
} from "@/src/lib/plans";
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
    include: {
      shop: {
        select: {
          id: true,
          domain: true,
          planName: true,
          monthlyShipmentLimit: true,
        },
      },
    },
  });

  if (!shipment || shipment.trackingProviderId) {
    return;
  }

  // Check the shop's monthly allowance before registering the tracker, since
  // registering it is what incurs the per-shipment tracking cost.
  const limit = monthlyShipmentLimitFor(shipment.shop);
  const trackedThisMonth = await prisma.shipment.count({
    where: {
      shopId: shipment.shopId,
      trackerCreatedAt: { gte: allowanceWindowStart() },
    },
  });

  if (trackedThisMonth >= limit) {
    // Mark it rather than failing the job: the shipment is a legitimate one we
    // are choosing not to track, so retrying it later would not help. The
    // reason is what the dashboard reads to prompt an upgrade.
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { trackingSkippedReason: OVER_ALLOWANCE_REASON },
    });

    console.warn(
      `Shop ${shipment.shop.domain} reached its monthly allowance ` +
        `(${trackedThisMonth}/${limit}); skipped tracking shipment ${shipment.id}.`,
    );
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
      trackerCreatedAt: new Date(),
      trackingSkippedReason: null,
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
    // Gate on the priority-boosted score so a VIP / high-value / expedited
    // order isn't filtered out of customer comms (Slack uses the same score).
    priority.effectiveRiskScore >= emailRule.minRiskScore &&
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
          sender: shopEmailSender(shipment.shop),
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

  if (!shop) {
    return;
  }

  const slackWebhookUrl = shop.slackDestination?.webhookUrl?.trim() || null;
  const digestEmailRecipient = shop.digestEmailEnabled
    ? shop.digestEmailRecipient?.trim() || shop.email?.trim() || null
    : null;

  // Nothing to deliver to.
  if (!slackWebhookUrl && !digestEmailRecipient) {
    return;
  }

  const notifyHighRiskOnly = shop.slackDestination?.notifyHighRiskOnly ?? false;

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
    // Don't filter by raw riskScore in SQL — the high-risk cut must happen
    // AFTER the priority boost (below), or VIP/high-value orders that only
    // clear 70 once boosted get dropped from the digest they belong in.
    prisma.shipment.findMany({
      where: {
        shopId: shop.id,
        latestExceptionType: { not: null },
        latestStatus: {
          not: ShipmentStatus.DELIVERED,
        },
      },
      orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
      take: 30,
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
    .filter((entry) =>
      // Apply the noise filter on the boosted score, consistently for both
      // explicit exceptions and no-movement entries.
      notifyHighRiskOnly ? entry.effectiveRiskScore >= 70 : true,
    )
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

  const DIGEST_SUBJECT = "DelayRadar daily digest";
  const startOfDay = startOfLocalDay(shop.timezone);

  // Per-channel same-local-day dedupe: a channel that already delivered today
  // is skipped, but the other channel can still send.
  async function alreadySentToday(channel: NotificationChannel) {
    if (input.force || !prisma) {
      return false;
    }
    const existing = await prisma.notificationLog.findFirst({
      where: {
        shopId: shop!.id,
        shipmentId: null,
        channel,
        status: NotificationDeliveryStatus.SENT,
        subject: DIGEST_SUBJECT,
        sentAt: { gte: startOfDay },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  let lastError: unknown = null;

  // Slack channel
  if (slackWebhookUrl && !(await alreadySentToday(NotificationChannel.SLACK))) {
    const target = slackTarget(shop.slackDestination?.channelLabel);
    try {
      await sendSlackMessage(slackWebhookUrl, digestText);
      await prisma.notificationLog.create({
        data: {
          shopId: shop.id,
          channel: NotificationChannel.SLACK,
          target,
          status: NotificationDeliveryStatus.SENT,
          subject: DIGEST_SUBJECT,
          body: digestText,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      lastError = error;
      await prisma.notificationLog.create({
        data: {
          shopId: shop.id,
          channel: NotificationChannel.SLACK,
          target,
          status: NotificationDeliveryStatus.FAILED,
          subject: DIGEST_SUBJECT,
          body: digestText,
          errorMessage:
            error instanceof Error ? error.message : "Slack digest delivery failed.",
        },
      });
    }
  }

  // Email channel
  if (
    digestEmailRecipient &&
    !(await alreadySentToday(NotificationChannel.EMAIL))
  ) {
    const subject = `${DIGEST_SUBJECT} — ${shop.shopName ?? shop.domain}`;
    try {
      const delivery = await sendEmail({
        to: digestEmailRecipient,
        subject,
        textBody: digestText,
        htmlBody: toHtmlBody(digestText),
        sender: shopEmailSender(shop),
      });
      await prisma.notificationLog.create({
        data: {
          shopId: shop.id,
          channel: NotificationChannel.EMAIL,
          target: digestEmailRecipient,
          status:
            delivery.status === "sent"
              ? NotificationDeliveryStatus.SENT
              : NotificationDeliveryStatus.SKIPPED,
          subject: DIGEST_SUBJECT,
          body: digestText,
          externalMessageId: delivery.externalMessageId,
          sentAt: delivery.status === "sent" ? new Date() : null,
        },
      });
    } catch (error) {
      lastError = error;
      await prisma.notificationLog.create({
        data: {
          shopId: shop.id,
          channel: NotificationChannel.EMAIL,
          target: digestEmailRecipient,
          status: NotificationDeliveryStatus.FAILED,
          subject: DIGEST_SUBJECT,
          body: digestText,
          errorMessage:
            error instanceof Error ? error.message : "Email digest delivery failed.",
        },
      });
    }
  }

  // Surface a delivery failure so the job retries, but only after both
  // channels have been attempted and logged.
  if (lastError) {
    throw lastError;
  }
}

export async function processQueueJob(job: QueueJob) {
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

