-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELAYED', 'EXCEPTION', 'ACTION_REQUIRED', 'AVAILABLE_FOR_PICKUP', 'DELIVERED', 'LOST');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('DELAYED', 'FAILED_DELIVERY', 'ADDRESS_ISSUE', 'AVAILABLE_FOR_PICKUP', 'LOST_IN_TRANSIT', 'RETURN_TO_SENDER', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'SLACK');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('SHOPIFY', 'EASYPOST');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('BACKFILL_SHIPMENTS', 'CREATE_TRACKER', 'DELIVER_EXCEPTION_NOTIFICATION', 'SEND_DAILY_DIGEST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrackingProvider" AS ENUM ('EASYPOST');

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "shopName" TEXT,
    "email" TEXT,
    "timezone" TEXT DEFAULT 'America/New_York',
    "currencyCode" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '',
    "offlineAccessToken" TEXT,
    "isInstalled" BOOLEAN NOT NULL DEFAULT false,
    "installedAt" TIMESTAMP(3),
    "uninstalledAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "shopifyOrderName" TEXT,
    "shopifyFulfillmentId" TEXT,
    "trackingNumber" TEXT NOT NULL,
    "trackingCarrier" TEXT,
    "trackingProvider" "TrackingProvider" NOT NULL DEFAULT 'EASYPOST',
    "trackingProviderId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "orderCreatedAt" TIMESTAMP(3),
    "promisedDeliveryDate" TIMESTAMP(3),
    "latestStatus" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "latestExceptionType" "ExceptionType",
    "latestCheckpointAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "providerEventId" TEXT,
    "normalizedStatus" "ShipmentStatus" NOT NULL,
    "exceptionType" "ExceptionType",
    "message" TEXT,
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "triggerType" "ExceptionType" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionRule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "templateId" TEXT,
    "exceptionType" "ExceptionType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "minRiskScore" INTEGER NOT NULL DEFAULT 20,
    "onlyWhenActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackDestination" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "channelLabel" TEXT,
    "dailyDigestHour" INTEGER NOT NULL DEFAULT 9,
    "notifyHighRiskOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "templateId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundWebhook" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "source" "WebhookSource" NOT NULL,
    "topic" TEXT NOT NULL,
    "externalId" TEXT,
    "shopDomain" TEXT,
    "headers" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "InboundWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "shipmentId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingProviderId_key" ON "Shipment"("trackingProviderId");

-- CreateIndex
CREATE INDEX "Shipment_shopifyFulfillmentId_idx" ON "Shipment"("shopifyFulfillmentId");

-- CreateIndex
CREATE INDEX "Shipment_shopId_latestStatus_idx" ON "Shipment"("shopId", "latestStatus");

-- CreateIndex
CREATE INDEX "Shipment_shopId_latestExceptionType_idx" ON "Shipment"("shopId", "latestExceptionType");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shopId_trackingNumber_key" ON "Shipment"("shopId", "trackingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StatusEvent_providerEventId_key" ON "StatusEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "StatusEvent_shipmentId_occurredAt_idx" ON "StatusEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_shopId_channel_triggerType_key" ON "MessageTemplate"("shopId", "channel", "triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "ExceptionRule_shopId_exceptionType_channel_key" ON "ExceptionRule"("shopId", "exceptionType", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "SlackDestination_shopId_key" ON "SlackDestination"("shopId");

-- CreateIndex
CREATE INDEX "NotificationLog_shopId_createdAt_idx" ON "NotificationLog"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "InboundWebhook_source_status_receivedAt_idx" ON "InboundWebhook"("source", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "QueueJob_status_availableAt_idx" ON "QueueJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "QueueJob_type_status_idx" ON "QueueJob"("type", "status");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRule" ADD CONSTRAINT "ExceptionRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRule" ADD CONSTRAINT "ExceptionRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackDestination" ADD CONSTRAINT "SlackDestination_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundWebhook" ADD CONSTRAINT "InboundWebhook_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

