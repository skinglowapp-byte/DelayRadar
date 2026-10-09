import { JobStatus, JobType } from "@prisma/client";

import { decrypt } from "@/src/lib/crypto";
import { enqueueJob } from "@/src/lib/jobs";
import {
  CARRIER_NOT_IN_PLAN_REASON,
  planFeaturesFor,
  planTierFor,
} from "@/src/lib/plans";
import { prisma } from "@/src/lib/prisma";

import { shopifyAdminGraphql } from "./admin";
import { withRevocationHandling } from "./revocation";

// Under Managed Pricing, Shopify owns the plans and the checkout; the app is
// forbidden from calling the Billing API. Reading the installation's active
// subscription is how we learn which plan a merchant actually chose.
const ACTIVE_SUBSCRIPTION_QUERY = `
  query DelayRadarActiveSubscription {
    currentAppInstallation {
      activeSubscriptions {
        name
        status
      }
    }
  }
`;

type ActiveSubscriptionResponse = {
  currentAppInstallation: {
    activeSubscriptions: Array<{ name: string; status: string }>;
  } | null;
};

export async function fetchActivePlanName(input: {
  shop: string;
  accessToken: string;
}): Promise<string | null> {
  const data = await shopifyAdminGraphql<ActiveSubscriptionResponse>({
    shop: input.shop,
    accessToken: input.accessToken,
    query: ACTIVE_SUBSCRIPTION_QUERY,
  });

  const active = data.currentAppInstallation?.activeSubscriptions?.find(
    (subscription) => subscription.status === "ACTIVE",
  );

  return active?.name ?? null;
}

// Refreshes the cached plan for one shop. Returns null when the shop can't be
// reached (uninstalled, or no offline token yet) so callers can skip it
// without treating it as a failure.
export async function syncShopPlan(shopId: string): Promise<string | null> {
  if (!prisma) {
    return null;
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      domain: true,
      offlineAccessToken: true,
      isInstalled: true,
    },
  });

  if (!shop?.isInstalled || !shop.offlineAccessToken) {
    return null;
  }

  // Tokens are stored encrypted at rest (see src/lib/shopify/oauth.ts).
  const result = await withRevocationHandling(shop.id, () =>
    fetchActivePlanName({
      shop: shop.domain,
      accessToken: decrypt(shop.offlineAccessToken!),
    }),
  );

  if (!result.ok) {
    return null;
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: { planName: result.value, planSyncedAt: new Date() },
  });

  if (planFeaturesFor(result.value).multiCarrier) {
    await requeueCarrierSkippedShipments(shop.id);
  }

  return result.value;
}

// Shipments skipped because a Free shop's plan covered one carrier are
// retried once the shop is on a plan that tracks every carrier. The tracker
// job re-checks the monthly allowance, so this can't overspend it.
async function requeueCarrierSkippedShipments(shopId: string) {
  if (!prisma) {
    return;
  }

  const skipped = await prisma.shipment.findMany({
    where: {
      shopId,
      trackingSkippedReason: CARRIER_NOT_IN_PLAN_REASON,
      trackingProviderId: null,
    },
    select: { id: true, trackingNumber: true, trackingCarrier: true },
    take: 500,
  });

  for (const shipment of skipped) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { trackingSkippedReason: null },
    });

    const pending = await prisma.queueJob.findFirst({
      where: {
        shipmentId: shipment.id,
        type: JobType.CREATE_TRACKER,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
      select: { id: true },
    });

    if (!pending) {
      await enqueueJob({
        shopId,
        shipmentId: shipment.id,
        type: JobType.CREATE_TRACKER,
        payload: {
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          carrier: shipment.trackingCarrier ?? "",
        },
      });
    }
  }
}

// How long a "no plan" (Free) result is trusted before a gate re-asks Shopify.
const FREE_PLAN_RECHECK_MS = 60_000;

// The plan name to gate on. Paid plans are trusted from the cache (the
// app_subscriptions/update webhook and the daily sync keep them current), but
// a Free result is re-checked when it's over a minute old: a merchant who
// picks Pro right after installing must not have their first backfill
// limited to 50 shipments and one carrier.
export async function planNameForGating(shop: {
  id: string;
  planName: string | null;
  planSyncedAt: Date | null;
}): Promise<string | null> {
  if (!prisma || planTierFor(shop.planName) !== "free") {
    return shop.planName;
  }

  const fresh =
    shop.planSyncedAt &&
    Date.now() - shop.planSyncedAt.getTime() < FREE_PLAN_RECHECK_MS;

  if (fresh) {
    return shop.planName;
  }

  try {
    await syncShopPlan(shop.id);
    const refreshed = await prisma.shop.findUnique({
      where: { id: shop.id },
      select: { planName: true },
    });
    return refreshed?.planName ?? null;
  } catch (error) {
    console.error(`Plan re-check failed for shop ${shop.id}:`, error);
    return shop.planName;
  }
}

const PLAN_REFRESH_INTERVAL_MS = 24 * 3600_000;

// Refreshes plans that have gone stale. Runs inside the scheduled worker
// rather than a request path so a Shopify outage slows nobody's dashboard.
export async function syncStalePlans(limit = 25) {
  if (!prisma) {
    return { checked: 0, updated: 0, revoked: 0, failed: 0 };
  }

  const cutoff = new Date(Date.now() - PLAN_REFRESH_INTERVAL_MS);
  const shops = await prisma.shop.findMany({
    where: {
      isInstalled: true,
      offlineAccessToken: { not: null },
      // Shops with no plan (Free) are re-checked on every run, so an upgrade
      // whose webhook was missed is still picked up within one worker cycle.
      OR: [
        { planSyncedAt: null },
        { planSyncedAt: { lte: cutoff } },
        { planName: null },
      ],
    },
    select: { id: true },
    take: limit,
  });

  let updated = 0;
  let revoked = 0;
  let failed = 0;

  for (const shop of shops) {
    try {
      // syncShopPlan returns null both for "no active subscription" and for
      // "token was revoked, shop retired". Re-read the flag to tell them
      // apart, so a run that quietly retired every install doesn't report
      // itself as having successfully updated them.
      await syncShopPlan(shop.id);
      const after = await prisma.shop.findUnique({
        where: { id: shop.id },
        select: { isInstalled: true },
      });

      if (after?.isInstalled) {
        updated++;
      } else {
        revoked++;
      }
    } catch (error) {
      failed++;
      console.error(`Plan sync failed for shop ${shop.id}:`, error);
    }
  }

  return { checked: shops.length, updated, revoked, failed };
}
