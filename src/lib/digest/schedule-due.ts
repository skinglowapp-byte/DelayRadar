import { nextDigestRunAt, normalizeTimeZone } from "@/src/lib/digest/schedule";
import { ensureDailyDigestJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";

/**
 * Enqueue a daily-digest job for every installed shop that has a Slack
 * destination and doesn't already have one queued. Shared by the worker cron
 * (so we stay within Hobby's 2-cron limit) and the manual digests route.
 */
export async function scheduleDueDigests() {
  if (!prisma) {
    return { shopsConsidered: 0, scheduledCount: 0, alreadyQueuedCount: 0 };
  }

  const shops = await prisma.shop.findMany({
    where: {
      isInstalled: true,
      slackDestination: { isNot: null },
    },
    include: { slackDestination: true },
  });

  let scheduledCount = 0;
  let alreadyQueuedCount = 0;

  for (const shop of shops) {
    if (!shop.slackDestination?.webhookUrl.trim()) {
      continue;
    }

    const availableAt = nextDigestRunAt({
      timeZone: normalizeTimeZone(shop.timezone),
      digestHour: shop.slackDestination.dailyDigestHour,
    });
    const result = await ensureDailyDigestJob({
      shopId: shop.id,
      availableAt,
    });

    if (result.alreadyQueued) {
      alreadyQueuedCount += 1;
      continue;
    }

    scheduledCount += 1;
  }

  return { shopsConsidered: shops.length, scheduledCount, alreadyQueuedCount };
}
