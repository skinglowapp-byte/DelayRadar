import { decrypt } from "@/src/lib/crypto";
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

  return result.value;
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
      OR: [{ planSyncedAt: null }, { planSyncedAt: { lte: cutoff } }],
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
