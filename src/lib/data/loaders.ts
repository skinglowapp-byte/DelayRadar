import {
  JobStatus,
  JobType,
  NotificationChannel,
  NotificationDeliveryStatus,
  ShipmentStatus,
} from "@prisma/client";

import { getDemoAppData, getInstallState } from "@/src/lib/data/mock";
import type {
  AppBootstrap,
  BackfillStatus,
  CarrierCoverage,
  CarrierReportRow,
  ExceptionDetail,
  ExceptionRow,
  MetricCardData,
  MonitoredShipmentRow,
  NoteRow,
  NotificationRuleSummary,
  OnboardingChecklist,
  OnboardingStep,
  RecommendationVerdict,
  SyncHealthSummary,
  TemplateRow,
  TimelineEntry,
  TriageBucket,
  WorkflowStateLabel,
} from "@/src/lib/data/types";
import { isSupportedCarrier } from "@/src/lib/tracking/supported-carriers";
import { managedEmailRules } from "@/src/lib/notifications/managed-email-rules";
import { managedSlackRules } from "@/src/lib/notifications/managed-slack-rules";
import { evaluateShipmentPriority } from "@/src/lib/priority/shipment-priority";
import { prisma } from "@/src/lib/prisma";
import { evaluateRecommendation } from "@/src/lib/recommendations/engine";
import {
  checkpointDate,
  DEFAULT_NO_MOVEMENT_THRESHOLD_HOURS,
  noMovementRiskScore,
} from "@/src/lib/shipment-helpers";
import { formatCurrency, formatRelativeTime, titleize } from "@/src/lib/utils";

function hasEmailProvider() {
  return Boolean(
    process.env.POSTMARK_SERVER_TOKEN || process.env.SENDGRID_API_KEY,
  );
}

function toSeverity(riskScore: number): "good" | "warn" | "bad" {
  if (riskScore >= 75) {
    return "bad";
  }

  if (riskScore >= 35) {
    return "warn";
  }

  return "good";
}

function previewMessage(value: string | null | undefined) {
  if (!value) {
    return "Notification body not captured.";
  }

  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}

const AGING_THRESHOLD_HOURS = 24;

type ShipmentHistoryShape = {
  id: string;
  shopifyOrderName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  trackingNumber: string;
  trackingCarrier: string | null;
  orderValueCents: number | null;
  orderTags: string | null;
  shippingMethodLabel: string | null;
  latestStatus: ShipmentStatus;
  latestExceptionType: string | null;
  latestCheckpointAt: Date | null;
  updatedAt: Date;
  riskScore: number;
  actionRequired: boolean;
  workflowState: string;
  assignedTo: string | null;
  reviewedAt: Date | null;
  snoozedUntil: Date | null;
  events: Array<{
    id: string;
    normalizedStatus: ShipmentStatus;
    exceptionType: string | null;
    message: string | null;
    actionRequired: boolean;
    occurredAt: Date;
  }>;
  notifications: Array<{
    id: string;
    channel: string;
    status: string;
    target: string;
    subject: string | null;
    body: string;
    sentAt: Date | null;
    createdAt: Date;
    template: {
      name: string;
    } | null;
  }>;
  notes: Array<{
    id: string;
    author: string;
    body: string;
    createdAt: Date;
  }>;
};

type ExceptionArtifact = {
  row: ExceptionRow;
  detail: ExceptionDetail;
  sortRisk: number;
  sortTimestamp: number;
};

function hoursSince(value: Date) {
  return (Date.now() - value.getTime()) / 3600000;
}

function toTriageBucket(
  ageHours: number,
  noMovementThresholdHours: number,
): TriageBucket {
  if (ageHours >= noMovementThresholdHours) {
    return "stale";
  }

  if (ageHours >= AGING_THRESHOLD_HOURS) {
    return "aging";
  }

  return "fresh";
}

function formatAgeWindow(ageHours: number) {
  if (ageHours < 48) {
    return `${Math.max(1, Math.round(ageHours))} hours`;
  }

  const days = Math.max(1, Math.round(ageHours / 24));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function mapTimeline(
  shipment: ShipmentHistoryShape,
  detailRiskScore: number,
): TimelineEntry[] {
  if (shipment.events.length > 0) {
    return shipment.events.map((event) => ({
      id: event.id,
      title: `${titleize(event.normalizedStatus)} update`,
      body: event.message ?? "Carrier update received.",
      occurredAt: formatRelativeTime(event.occurredAt),
      tone:
        event.exceptionType || event.actionRequired
          ? toSeverity(detailRiskScore)
          : event.normalizedStatus === ShipmentStatus.DELIVERED
            ? "good"
            : "muted",
    }));
  }

  return [
    {
      id: `${shipment.id}-no-events`,
      title: "Tracker registered",
      body:
        "DelayRadar is monitoring this tracking number, but the carrier has not posted a recent checkpoint yet.",
      occurredAt: formatRelativeTime(checkpointDate(shipment)),
      tone: "muted",
    },
  ];
}

function mapWorkflowState(value: string): WorkflowStateLabel {
  switch (value) {
    case "SNOOZED":
      return "snoozed";
    case "RESOLVED":
      return "resolved";
    default:
      return "open";
  }
}

function mapNotes(shipment: ShipmentHistoryShape): NoteRow[] {
  return shipment.notes.map((note) => ({
    id: note.id,
    author: note.author,
    body: note.body,
    createdAt: formatRelativeTime(note.createdAt),
  }));
}

function mapNotificationHistory(shipment: ShipmentHistoryShape) {
  return shipment.notifications.map((log) => ({
    id: log.id,
    channel: titleize(log.channel),
    status: titleize(log.status),
    target: log.target,
    templateName: log.template?.name ?? "Direct notification",
    subject: log.subject ?? log.template?.name ?? "Notification",
    bodyPreview: previewMessage(log.body),
    sentAt: formatRelativeTime(log.sentAt ?? log.createdAt),
  }));
}

function countDeliveryAttempts(shipment: ShipmentHistoryShape): number {
  return shipment.events.filter(
    (event) =>
      event.exceptionType === "FAILED_DELIVERY" ||
      event.normalizedStatus.toString() === "ACTION_REQUIRED",
  ).length;
}

function buildExplicitExceptionArtifact(
  shipment: ShipmentHistoryShape,
  noMovementThresholdHours: number,
  lostInTransitThresholdHours: number,
  prioritySettings: {
    priorityOrderValueThresholdCents: number;
    vipTagPattern: string;
    currencyCode: string;
  },
): ExceptionArtifact {
  const latestEvent = shipment.events[0];
  const exceptionType = shipment.latestExceptionType ?? "OTHER";
  const checkpointAt = checkpointDate(shipment);
  const ageHours = hoursSince(checkpointAt);
  const triageBucket = toTriageBucket(ageHours, noMovementThresholdHours);
  const priority = evaluateShipmentPriority({
    baseRiskScore: shipment.riskScore,
    orderValueCents: shipment.orderValueCents,
    orderTags: shipment.orderTags,
    shippingMethodLabel: shipment.shippingMethodLabel,
    priorityOrderValueThresholdCents:
      prioritySettings.priorityOrderValueThresholdCents,
    vipTagPattern: prioritySettings.vipTagPattern,
    currencyCode: prioritySettings.currencyCode,
  });

  const recommendation = evaluateRecommendation({
    exceptionType,
    ageHours,
    riskScore: priority.effectiveRiskScore,
    orderValueCents: shipment.orderValueCents,
    isVip: priority.isVip,
    isHighValue: priority.isHighValue,
    customerAction: shipment.actionRequired,
    deliveryAttempts: countDeliveryAttempts(shipment),
    noMovementThresholdHours,
    lostInTransitThresholdHours,
    hasPromisedDeliveryDate: false,
    promisedDeliveryPassed: false,
  });

  return {
    row: {
      id: shipment.id,
      orderName: shipment.shopifyOrderName ?? "Unlabeled order",
      customerName: shipment.customerName ?? "Unknown customer",
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.trackingCarrier ?? "Carrier unknown",
      statusLabel: latestEvent?.message ?? titleize(shipment.latestStatus),
      exceptionType: titleize(exceptionType),
      severity: toSeverity(priority.effectiveRiskScore),
      customerAction: shipment.actionRequired,
      lastCheckpointAt: formatRelativeTime(checkpointAt),
      riskScore: priority.effectiveRiskScore,
      carrierRiskScore: shipment.riskScore,
      priorityLabel: priority.priorityLabel,
      recommendedAction: recommendation.label,
      triageBucket,
      workflowState: mapWorkflowState(shipment.workflowState),
      assignedTo: shipment.assignedTo,
      reviewedAt: shipment.reviewedAt
        ? formatRelativeTime(shipment.reviewedAt)
        : null,
      snoozedUntil: shipment.snoozedUntil
        ? shipment.snoozedUntil.toISOString()
        : null,
    },
    detail: {
      shipmentId: shipment.id,
      orderName: shipment.shopifyOrderName ?? "Unlabeled order",
      customerName: shipment.customerName ?? "Unknown customer",
      customerEmail: shipment.customerEmail,
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.trackingCarrier ?? "Carrier unknown",
      latestStatus: titleize(shipment.latestStatus),
      exceptionType: titleize(exceptionType),
      recommendedAction: recommendation.label,
      recommendation,
      customerAction: shipment.actionRequired,
      riskScore: priority.effectiveRiskScore,
      carrierRiskScore: shipment.riskScore,
      priorityLabel: priority.priorityLabel,
      priorityReasons: priority.priorityReasons,
      orderValueLabel:
        typeof shipment.orderValueCents === "number"
          ? formatCurrency(
              shipment.orderValueCents / 100,
              prioritySettings.currencyCode,
            )
          : null,
      shippingMethodLabel: shipment.shippingMethodLabel,
      lastCheckpointAt: formatRelativeTime(checkpointAt),
      triageBucket,
      workflowState: mapWorkflowState(shipment.workflowState),
      assignedTo: shipment.assignedTo,
      reviewedAt: shipment.reviewedAt
        ? formatRelativeTime(shipment.reviewedAt)
        : null,
      snoozedUntil: shipment.snoozedUntil
        ? shipment.snoozedUntil.toISOString()
        : null,
      events: mapTimeline(shipment, priority.effectiveRiskScore),
      notifications: mapNotificationHistory(shipment),
      notes: mapNotes(shipment),
    },
    sortRisk: priority.effectiveRiskScore,
    sortTimestamp: checkpointAt.getTime(),
  };
}

function buildStaleShipmentArtifact(
  shipment: ShipmentHistoryShape,
  noMovementThresholdHours: number,
  lostInTransitThresholdHours: number,
  prioritySettings: {
    priorityOrderValueThresholdCents: number;
    vipTagPattern: string;
    currencyCode: string;
  },
): ExceptionArtifact {
  const checkpointAt = checkpointDate(shipment);
  const ageHours = hoursSince(checkpointAt);
  const carrierRiskScore = Math.max(
    shipment.riskScore,
    noMovementRiskScore(ageHours, noMovementThresholdHours),
  );
  const priority = evaluateShipmentPriority({
    baseRiskScore: carrierRiskScore,
    orderValueCents: shipment.orderValueCents,
    orderTags: shipment.orderTags,
    shippingMethodLabel: shipment.shippingMethodLabel,
    priorityOrderValueThresholdCents:
      prioritySettings.priorityOrderValueThresholdCents,
    vipTagPattern: prioritySettings.vipTagPattern,
    currencyCode: prioritySettings.currencyCode,
  });
  const triageBucket = toTriageBucket(ageHours, noMovementThresholdHours);

  const recommendation = evaluateRecommendation({
    exceptionType: "No Tracking Movement",
    ageHours,
    riskScore: priority.effectiveRiskScore,
    orderValueCents: shipment.orderValueCents,
    isVip: priority.isVip,
    isHighValue: priority.isHighValue,
    customerAction: false,
    deliveryAttempts: 0,
    noMovementThresholdHours,
    lostInTransitThresholdHours,
    hasPromisedDeliveryDate: false,
    promisedDeliveryPassed: false,
  });

  return {
    row: {
      id: shipment.id,
      orderName: shipment.shopifyOrderName ?? "Unlabeled order",
      customerName: shipment.customerName ?? "Unknown customer",
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.trackingCarrier ?? "Carrier unknown",
      statusLabel: `No carrier scan for ${formatAgeWindow(ageHours)}`,
      exceptionType: "No Tracking Movement",
      severity: toSeverity(priority.effectiveRiskScore),
      customerAction: false,
      lastCheckpointAt: formatRelativeTime(checkpointAt),
      riskScore: priority.effectiveRiskScore,
      carrierRiskScore,
      priorityLabel: priority.priorityLabel,
      recommendedAction: recommendation.label,
      triageBucket,
      workflowState: mapWorkflowState(shipment.workflowState),
      assignedTo: shipment.assignedTo,
      reviewedAt: shipment.reviewedAt
        ? formatRelativeTime(shipment.reviewedAt)
        : null,
      snoozedUntil: shipment.snoozedUntil
        ? shipment.snoozedUntil.toISOString()
        : null,
    },
    detail: {
      shipmentId: shipment.id,
      orderName: shipment.shopifyOrderName ?? "Unlabeled order",
      customerName: shipment.customerName ?? "Unknown customer",
      customerEmail: shipment.customerEmail,
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.trackingCarrier ?? "Carrier unknown",
      latestStatus: titleize(shipment.latestStatus),
      exceptionType: "No Tracking Movement",
      recommendedAction: recommendation.label,
      recommendation,
      customerAction: false,
      riskScore: priority.effectiveRiskScore,
      carrierRiskScore,
      priorityLabel: priority.priorityLabel,
      priorityReasons: priority.priorityReasons,
      orderValueLabel:
        typeof shipment.orderValueCents === "number"
          ? formatCurrency(
              shipment.orderValueCents / 100,
              prioritySettings.currencyCode,
            )
          : null,
      shippingMethodLabel: shipment.shippingMethodLabel,
      lastCheckpointAt: formatRelativeTime(checkpointAt),
      triageBucket,
      workflowState: mapWorkflowState(shipment.workflowState),
      assignedTo: shipment.assignedTo,
      reviewedAt: shipment.reviewedAt
        ? formatRelativeTime(shipment.reviewedAt)
        : null,
      snoozedUntil: shipment.snoozedUntil
        ? shipment.snoozedUntil.toISOString()
        : null,
      events: mapTimeline(shipment, priority.effectiveRiskScore),
      notifications: mapNotificationHistory(shipment),
      notes: mapNotes(shipment),
    },
    sortRisk: priority.effectiveRiskScore,
    sortTimestamp: checkpointAt.getTime(),
  };
}

async function buildCarrierReport(shopId: string): Promise<CarrierReportRow[]> {
  if (!prisma) {
    return [];
  }

  const allShipments = await prisma.shipment.findMany({
    where: { shopId },
    select: {
      trackingCarrier: true,
      latestExceptionType: true,
      riskScore: true,
      resolvedAt: true,
      createdAt: true,
    },
  });

  const carrierMap = new Map<
    string,
    {
      total: number;
      exceptions: number;
      riskSum: number;
      lostCount: number;
      resolutionHoursSum: number;
      resolvedCount: number;
      exceptionTypes: Map<string, number>;
    }
  >();

  for (const shipment of allShipments) {
    const carrier = shipment.trackingCarrier ?? "Unknown";
    let entry = carrierMap.get(carrier);

    if (!entry) {
      entry = {
        total: 0,
        exceptions: 0,
        riskSum: 0,
        lostCount: 0,
        resolutionHoursSum: 0,
        resolvedCount: 0,
        exceptionTypes: new Map(),
      };
      carrierMap.set(carrier, entry);
    }

    entry.total++;
    entry.riskSum += shipment.riskScore;

    if (shipment.latestExceptionType) {
      entry.exceptions++;
      const typeCount =
        entry.exceptionTypes.get(shipment.latestExceptionType) ?? 0;
      entry.exceptionTypes.set(shipment.latestExceptionType, typeCount + 1);

      if (shipment.latestExceptionType === "LOST_IN_TRANSIT") {
        entry.lostCount++;
      }

      if (shipment.resolvedAt) {
        entry.resolvedCount++;
        entry.resolutionHoursSum +=
          (shipment.resolvedAt.getTime() - shipment.createdAt.getTime()) /
          3600000;
      }
    }
  }

  const rows: CarrierReportRow[] = [];

  for (const [carrier, entry] of carrierMap) {
    let topExceptionType = "None";
    let topCount = 0;

    for (const [type, count] of entry.exceptionTypes) {
      if (count > topCount) {
        topCount = count;
        topExceptionType = titleize(type);
      }
    }

    rows.push({
      carrier,
      totalShipments: entry.total,
      exceptionCount: entry.exceptions,
      exceptionRate:
        entry.total > 0
          ? Math.round((entry.exceptions / entry.total) * 100)
          : 0,
      avgRiskScore:
        entry.total > 0 ? Math.round(entry.riskSum / entry.total) : 0,
      topExceptionType,
      lostInTransitCount: entry.lostCount,
      avgResolutionHours:
        entry.resolvedCount > 0
          ? Math.round(entry.resolutionHoursSum / entry.resolvedCount)
          : null,
    });
  }

  return rows.sort((a, b) => b.exceptionRate - a.exceptionRate);
}

function toShipmentTone(input: {
  latestStatus: ShipmentStatus;
  latestExceptionType: string | null;
  riskScore: number;
}) {
  if (input.latestExceptionType) {
    return toSeverity(input.riskScore);
  }

  if (input.latestStatus === ShipmentStatus.DELIVERED) {
    return "good" as const;
  }

  if (input.latestStatus === ShipmentStatus.AVAILABLE_FOR_PICKUP) {
    return "warn" as const;
  }

  return "muted" as const;
}

async function buildSyncHealth(shopId: string, lastSyncedAt: Date | null): Promise<SyncHealthSummary> {
  if (!prisma) {
    return {
      lastSyncedAt: null, syncAgeLabel: "Never", syncTone: "muted",
      totalShipments: 0, activeTrackers: 0,
      webhooksLast24h: 0, webhookFailuresLast24h: 0,
      workerBacklog: 0, workerFailedJobs: 0,
      notificationsSentLast24h: 0, notificationFailuresLast24h: 0,
    };
  }

  const oneDayAgo = new Date(Date.now() - 24 * 3600000);

  const [
    totalShipments,
    activeTrackers,
    webhooksLast24h,
    webhookFailuresLast24h,
    workerBacklog,
    workerFailedJobs,
    notificationsSentLast24h,
    notificationFailuresLast24h,
  ] = await Promise.all([
    prisma.shipment.count({ where: { shopId } }),
    prisma.shipment.count({ where: { shopId, trackingProviderId: { not: null } } }),
    prisma.inboundWebhook.count({ where: { receivedAt: { gte: oneDayAgo } } }),
    prisma.inboundWebhook.count({ where: { status: "FAILED", receivedAt: { gte: oneDayAgo } } }),
    prisma.queueJob.count({ where: { status: "PENDING" } }),
    prisma.queueJob.count({ where: { status: "FAILED" } }),
    prisma.notificationLog.count({ where: { shopId, status: "SENT", createdAt: { gte: oneDayAgo } } }),
    prisma.notificationLog.count({ where: { shopId, status: "FAILED", createdAt: { gte: oneDayAgo } } }),
  ]);

  let syncAgeLabel = "Never";
  let syncTone: "good" | "warn" | "bad" | "muted" = "muted";

  if (lastSyncedAt) {
    const syncAgeHours = hoursSince(lastSyncedAt);
    syncAgeLabel = formatRelativeTime(lastSyncedAt);
    syncTone = syncAgeHours > 48 ? "bad" : syncAgeHours > 12 ? "warn" : "good";
  }

  return {
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    syncAgeLabel,
    syncTone,
    totalShipments,
    activeTrackers,
    webhooksLast24h,
    webhookFailuresLast24h,
    workerBacklog,
    workerFailedJobs,
    notificationsSentLast24h,
    notificationFailuresLast24h,
  };
}

async function buildBackfillStatus(
  shopId: string,
  lastSyncedAt: Date | null,
  totalShipments: number,
): Promise<BackfillStatus> {
  if (!prisma) {
    return {
      state: lastSyncedAt ? "complete" : "idle",
      lastSyncedAt: formatRelativeTime(lastSyncedAt),
      totalShipments,
    };
  }

  const activeJob = await prisma.queueJob.findFirst({
    where: {
      shopId,
      type: JobType.BACKFILL_SHIPMENTS,
      status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
    },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });

  let state: BackfillStatus["state"];
  if (activeJob) {
    state = activeJob.status === JobStatus.PROCESSING ? "running" : "queued";
  } else if (lastSyncedAt) {
    state = "complete";
  } else {
    state = "idle";
  }

  return {
    state,
    lastSyncedAt: formatRelativeTime(lastSyncedAt),
    totalShipments,
  };
}

async function buildCarrierCoverage(shopId: string): Promise<CarrierCoverage> {
  if (!prisma) {
    return {
      entries: [],
      supportedShipmentCount: 0,
      unsupportedShipmentCount: 0,
      unsupportedCarriers: [],
      hasShipments: false,
    };
  }

  const grouped = await prisma.shipment.groupBy({
    by: ["trackingCarrier"],
    where: { shopId },
    _count: { _all: true },
  });

  const entries = grouped
    .map((row) => {
      const carrier = row.trackingCarrier?.trim() || "Unknown";
      return {
        carrier,
        shipmentCount: row._count._all,
        supported: isSupportedCarrier(row.trackingCarrier),
      };
    })
    .sort((left, right) => right.shipmentCount - left.shipmentCount);

  let supportedShipmentCount = 0;
  let unsupportedShipmentCount = 0;
  const unsupportedCarriers: string[] = [];
  for (const entry of entries) {
    if (entry.supported) {
      supportedShipmentCount += entry.shipmentCount;
    } else {
      unsupportedShipmentCount += entry.shipmentCount;
      unsupportedCarriers.push(entry.carrier);
    }
  }

  return {
    entries,
    supportedShipmentCount,
    unsupportedShipmentCount,
    unsupportedCarriers,
    hasShipments: entries.length > 0,
  };
}

function buildOnboardingChecklist(shop: {
  isInstalled: boolean;
  offlineAccessToken: string | null;
  lastSyncedAt: Date | null;
  slackDestination: { webhookUrl: string } | null;
}, counts: {
  totalShipments: number;
  activeTrackers: number;
  templateCount: number;
}): OnboardingChecklist {
  const steps: OnboardingStep[] = [
    { key: "install", label: "Install the Shopify app", complete: shop.isInstalled },
    { key: "token", label: "Authorize offline access", complete: Boolean(shop.offlineAccessToken) },
    { key: "sync", label: "Run your first fulfillment sync", complete: Boolean(shop.lastSyncedAt), href: "#settings" },
    { key: "shipments", label: "Import at least one shipment", complete: counts.totalShipments > 0 },
    { key: "trackers", label: "Create EasyPost trackers", complete: counts.activeTrackers > 0 },
    { key: "templates", label: "Configure notification templates", complete: counts.templateCount > 0, href: "#settings" },
    { key: "slack", label: "Set up Slack integration", complete: Boolean(shop.slackDestination?.webhookUrl), href: "#settings" },
  ];

  const completedCount = steps.filter((s) => s.complete).length;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    allComplete: completedCount === steps.length,
  };
}

export async function getAppBootstrap(
  shopDomain: string | null,
): Promise<AppBootstrap> {
  if (!shopDomain) {
    return getInstallState();
  }

  if (shopDomain === "demo-shop.myshopify.com") {
    return getDemoAppData(shopDomain);
  }

  if (!prisma) {
    return getDemoAppData(shopDomain);
  }

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    include: {
      exceptionRules: true,
      slackDestination: true,
    },
  });

  if (!shop) {
    return getInstallState(shopDomain);
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const noMovementThresholdHours =
    shop.noMovementThresholdHours ?? DEFAULT_NO_MOVEMENT_THRESHOLD_HOURS;
  const lostInTransitThresholdHours =
    shop.lostInTransitThresholdHours ?? 168;
  const priorityOrderValueThresholdCents =
    shop.priorityOrderValueThresholdCents ?? 15000;
  const vipTagPattern = shop.vipTagPattern?.trim() || "vip";
  const currencyCode = shop.currencyCode ?? "USD";
  const staleThresholdAt = new Date(
    Date.now() - noMovementThresholdHours * 3600000,
  );

  const [
    trackedShipments,
    trackerBacklog,
    pickupIssues,
    sentToday,
    queuedDigests,
    exceptions,
    staleCandidates,
    recentShipments,
    templates,
    events,
  ] = await Promise.all([
    prisma.shipment.count({
      where: {
        shopId: shop.id,
      },
    }),
    prisma.shipment.count({
      where: {
        shopId: shop.id,
        trackingProviderId: null,
      },
    }),
    prisma.shipment.count({
      where: {
        shopId: shop.id,
        latestStatus: ShipmentStatus.AVAILABLE_FOR_PICKUP,
      },
    }),
    prisma.notificationLog.count({
      where: {
        shopId: shop.id,
        status: NotificationDeliveryStatus.SENT,
        sentAt: { gte: startOfDay },
      },
    }),
    prisma.queueJob.count({
      where: {
        shopId: shop.id,
        type: "SEND_DAILY_DIGEST",
        status: "PENDING",
      },
    }),
    prisma.shipment.findMany({
      where: {
        shopId: shop.id,
        latestExceptionType: { not: null },
        latestStatus: { not: ShipmentStatus.DELIVERED },
      },
      orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
      take: 12,
      include: {
        events: {
          orderBy: { occurredAt: "desc" },
          take: 5,
        },
        notifications: {
          orderBy: [{ createdAt: "desc" }],
          take: 5,
          include: {
            template: true,
          },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
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
      take: 12,
      include: {
        events: {
          orderBy: { occurredAt: "desc" },
          take: 5,
        },
        notifications: {
          orderBy: [{ createdAt: "desc" }],
          take: 5,
          include: {
            template: true,
          },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    }),
    prisma.shipment.findMany({
      where: {
        shopId: shop.id,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 8,
    }),
    prisma.messageTemplate.findMany({
      where: { shopId: shop.id },
      orderBy: [{ channel: "asc" }, { triggerType: "asc" }],
    }),
    prisma.statusEvent.findMany({
      where: {
        shipment: {
          shopId: shop.id,
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 6,
      include: {
        shipment: true,
      },
    }),
  ]);

  const exceptionArtifacts = [
    ...exceptions.map((shipment) =>
      buildExplicitExceptionArtifact(
        shipment as ShipmentHistoryShape,
        noMovementThresholdHours,
        lostInTransitThresholdHours,
        {
          priorityOrderValueThresholdCents,
          vipTagPattern,
          currencyCode,
        },
      ),
    ),
    ...staleCandidates.map((shipment) =>
      buildStaleShipmentArtifact(
        shipment as ShipmentHistoryShape,
        noMovementThresholdHours,
        lostInTransitThresholdHours,
        {
          priorityOrderValueThresholdCents,
          vipTagPattern,
          currencyCode,
        },
      ),
    ),
  ].sort((left, right) => {
    if (right.sortRisk !== left.sortRisk) {
      return right.sortRisk - left.sortRisk;
    }

    return left.sortTimestamp - right.sortTimestamp;
  });

  const exceptionInbox = exceptionArtifacts.map((item) => item.row);
  const exceptionDetails = exceptionArtifacts.map((item) => item.detail);
  const openExceptions = exceptionInbox.length;
  const actionRequired = exceptionInbox.filter(
    (shipment) => shipment.customerAction,
  ).length;
  const highRiskCount = exceptionInbox.filter(
    (shipment) => shipment.riskScore >= 70,
  ).length;
  const staleShipments = exceptionInbox.filter(
    (shipment) => shipment.exceptionType === "No Tracking Movement",
  ).length;
  const emailRuleMap = new Map(
    shop.exceptionRules
      .filter((rule) => rule.channel === NotificationChannel.EMAIL)
      .map((rule) => [rule.exceptionType, rule]),
  );
  const emailRules: NotificationRuleSummary[] = managedEmailRules.map(
    (rule) => ({
      triggerType: rule.triggerType,
      label: rule.label,
      active: emailRuleMap.get(rule.triggerType)?.active ?? true,
    }),
  );
  const slackRuleMap = new Map(
    shop.exceptionRules
      .filter((rule) => rule.channel === NotificationChannel.SLACK)
      .map((rule) => [rule.exceptionType, rule]),
  );
  const slackRules: NotificationRuleSummary[] = managedSlackRules.map((rule) => ({
    triggerType: rule.triggerType,
    label: rule.label,
    active: slackRuleMap.get(rule.triggerType)?.active ?? true,
  }));

  const metrics: MetricCardData[] = [
    {
      label: "Tracked shipments",
      value: String(trackedShipments),
      footnote:
        trackedShipments > 0
          ? `${trackerBacklog} trackers still queued`
          : "Run a sync after install to ingest fulfillments",
      tone:
        trackedShipments === 0
          ? "muted"
          : trackerBacklog > 0
            ? "warn"
            : "good",
    },
    {
      label: "Open exceptions",
      value: String(openExceptions),
      footnote:
        staleShipments > 0
          ? `${actionRequired} need customer action · ${staleShipments} are stale`
          : `${actionRequired} need customer action`,
      tone: openExceptions > 10 ? "bad" : openExceptions > 0 ? "warn" : "good",
    },
    {
      label: "Messages sent",
      value: String(sentToday),
      footnote: "Auto-messages sent since midnight",
      tone: sentToday > 0 ? "good" : "muted",
    },
    {
      label: "High-risk shipments",
      value: String(highRiskCount),
      footnote: "Risk score 70+ across active exceptions",
      tone: highRiskCount > 0 ? "warn" : "good",
    },
    {
      label: "Pickup issues",
      value: String(pickupIssues),
      footnote: `${queuedDigests} digest jobs queued`,
      tone: pickupIssues > 0 ? "warn" : "muted",
    },
  ];

  const monitoredShipments: MonitoredShipmentRow[] = recentShipments.map(
    (shipment) => ({
      id: shipment.id,
      orderName: shipment.shopifyOrderName ?? "Unlabeled order",
      customerName: shipment.customerName ?? "Unknown customer",
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.trackingCarrier ?? "Carrier unknown",
      latestStatus: titleize(shipment.latestStatus),
      latestStatusTone: toShipmentTone({
        latestStatus: shipment.latestStatus,
        latestExceptionType: shipment.latestExceptionType,
        riskScore: shipment.riskScore,
      }),
      exceptionType: shipment.latestExceptionType
        ? titleize(shipment.latestExceptionType)
        : null,
      trackerState: shipment.trackingProviderId
        ? "Tracker active"
        : "Tracker pending",
      lastCheckpointAt: formatRelativeTime(
        shipment.latestCheckpointAt ?? shipment.updatedAt,
      ),
      riskScore: shipment.riskScore,
    }),
  );

  const templateRows: TemplateRow[] = templates.map((template) => ({
    id: template.id,
    name: template.name,
    channel: template.channel,
    triggerType: template.triggerType,
    subject: template.subject ?? "",
    body: template.body,
    active: template.active,
  }));

  const timeline: TimelineEntry[] = events.map((event) => ({
    id: event.id,
    title: `${titleize(event.normalizedStatus)} on ${
      event.shipment.shopifyOrderName ?? event.shipment.trackingNumber
    }`,
    body:
      event.message ??
      `${titleize(event.shipment.latestStatus)} update received from ${
        event.shipment.trackingCarrier ?? "the carrier"
      }.`,
    occurredAt: formatRelativeTime(event.occurredAt),
    tone:
      event.exceptionType || event.shipment.actionRequired
        ? toSeverity(event.shipment.riskScore)
        : "good",
  }));

  const [carrierReport, health, backfill, carrierCoverage] = await Promise.all([
    buildCarrierReport(shop.id),
    buildSyncHealth(shop.id, shop.lastSyncedAt),
    buildBackfillStatus(shop.id, shop.lastSyncedAt, trackedShipments),
    buildCarrierCoverage(shop.id),
  ]);

  const onboarding = buildOnboardingChecklist(shop, {
    totalShipments: trackedShipments,
    activeTrackers: trackedShipments - trackerBacklog,
    templateCount: templates.length,
  });

  return {
    mode: "live",
    prefilledShop: shop.domain,
    shop: {
      domain: shop.domain,
      name: shop.shopName ?? shop.domain,
      email: shop.email ?? null,
      statusLabel: shop.isInstalled
        ? "Live store connected and monitoring shipments"
        : "Install incomplete",
      modeLabel: "EasyPost tracking-first MVP",
      lastSyncedAt: formatRelativeTime(shop.lastSyncedAt),
    },
    metrics,
    exceptionInbox,
    exceptionDetails,
    recentShipments: monitoredShipments,
    templates: templateRows,
    timeline,
    carrierReport,
    health,
    onboarding,
    backfill,
    carrierCoverage,
    settings: {
      trackingProvider: "EasyPost",
      currencyCode,
      slackConfigured: Boolean(shop.slackDestination?.webhookUrl),
      digestHour: shop.slackDestination?.dailyDigestHour ?? 9,
      notifyHighRiskOnly: shop.slackDestination?.notifyHighRiskOnly ?? true,
      hasEmailProvider: hasEmailProvider(),
      noMovementThresholdHours,
      lostInTransitThresholdHours,
      priorityOrderValueThresholdCents,
      vipTagPattern,
      emailRules,
      slackRules,
    },
    assumptions: [
      "This store is connected with an offline Shopify token and a tracking-first EasyPost workflow.",
      "Exception notification rules are scoped to proactive comms, not returns or auto-refunds yet.",
      "Slack escalation stays focused on high-risk shipments so support teams only see the exceptions that matter.",
    ],
  };
}
