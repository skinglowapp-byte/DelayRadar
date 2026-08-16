-- Per-shop email sender identity (custom From requires the app owner to have
-- verified the domain with the email provider; Reply-To works immediately).
ALTER TABLE "Shop" ADD COLUMN "senderName" TEXT;
ALTER TABLE "Shop" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "Shop" ADD COLUMN "senderVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN "replyToEmail" TEXT;

-- Email daily digest (previously Slack-only).
ALTER TABLE "Shop" ADD COLUMN "digestEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN "digestEmailRecipient" TEXT;
ALTER TABLE "Shop" ADD COLUMN "digestHour" INTEGER NOT NULL DEFAULT 9;
