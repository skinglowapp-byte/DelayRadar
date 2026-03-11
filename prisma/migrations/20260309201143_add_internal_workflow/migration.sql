-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('OPEN', 'SNOOZED', 'RESOLVED');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "workflowState" "WorkflowState" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "ShipmentNote" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentNote_shipmentId_createdAt_idx" ON "ShipmentNote"("shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_shipmentId_channel_status_idx" ON "NotificationLog"("shipmentId", "channel", "status");

-- CreateIndex
CREATE INDEX "QueueJob_shopId_type_status_idx" ON "QueueJob"("shopId", "type", "status");

-- CreateIndex
CREATE INDEX "Shipment_shopId_workflowState_idx" ON "Shipment"("shopId", "workflowState");

-- AddForeignKey
ALTER TABLE "ShipmentNote" ADD CONSTRAINT "ShipmentNote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
