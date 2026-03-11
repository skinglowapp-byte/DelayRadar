-- AlterTable
ALTER TABLE "InboundWebhook" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InboundWebhook_idempotencyKey_key" ON "InboundWebhook"("idempotencyKey");
