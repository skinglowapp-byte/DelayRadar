-- Emit delivery exceptions into the merchant's own Klaviyo account so they can
-- run them through existing branded flows rather than our sender. Reuses
-- NotificationLog, which is what gives per-shipment dedupe for free.
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'KLAVIYO' AFTER 'SLACK';

-- Private API key is stored encrypted at rest, like the Shopify token.
ALTER TABLE "Shop" ADD COLUMN "klaviyoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN "klaviyoApiKey" TEXT;
ALTER TABLE "Shop" ADD COLUMN "klaviyoLastEventAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "klaviyoLastError" TEXT;
