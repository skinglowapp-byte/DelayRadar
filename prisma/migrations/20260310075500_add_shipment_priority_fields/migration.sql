ALTER TABLE "Shop"
ADD COLUMN "priorityOrderValueThresholdCents" INTEGER NOT NULL DEFAULT 15000,
ADD COLUMN "vipTagPattern" TEXT NOT NULL DEFAULT 'vip';

ALTER TABLE "Shipment"
ADD COLUMN "orderValueCents" INTEGER,
ADD COLUMN "orderTags" TEXT,
ADD COLUMN "shippingMethodLabel" TEXT;
