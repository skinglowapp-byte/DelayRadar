-- Heartbeat table for the scheduled worker. Vercel Hobby keeps runtime logs
-- for roughly an hour, so after the fact there is no way to tell whether a
-- cron fired and failed or never fired at all. One row per invocation.
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt");
