-- Managed Pricing plan cached from Shopify, plus a per-shop override for the
-- monthly tracked-shipment allowance. All nullable: existing rows fall back to
-- the default allowance until the worker's next plan refresh.
ALTER TABLE "Shop" ADD COLUMN "planName" TEXT;
ALTER TABLE "Shop" ADD COLUMN "planSyncedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "monthlyShipmentLimit" INTEGER;

-- Tracking is billed per registered tracker, so the allowance counts trackers
-- registered in the window rather than shipment rows created in it.
ALTER TABLE "Shipment" ADD COLUMN "trackerCreatedAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "trackingSkippedReason" TEXT;

-- Backfill: every shipment that already has a tracker was registered before
-- allowances existed. Attribute it to the shipment's creation time so history
-- stays truthful, rather than to now, which would consume this month's
-- allowance for work that was already paid for.
UPDATE "Shipment"
SET "trackerCreatedAt" = "createdAt"
WHERE "trackingProviderId" IS NOT NULL;

CREATE INDEX "Shipment_shopId_trackerCreatedAt_idx" ON "Shipment"("shopId", "trackerCreatedAt");
