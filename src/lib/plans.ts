// Monthly tracked-shipment allowances.
//
// Carrier tracking is billed per tracker, so cost scales with the merchant's
// shipment volume while a flat subscription does not. Without a ceiling, one
// high-volume install can cost more to serve than every paying shop combined.
// The allowance is enforced where the tracker is registered — see
// src/worker/process-job.ts.
//
// Keys are the plan names configured in the Shopify Partner Dashboard under
// Managed Pricing (Free Plan / Pro $19 / Business $49 / Enterprise $99), which
// is where Shopify owns the prices. Names are matched case-insensitively, and
// the dashboard's misspelt "Enterprice" display name and "enterpirce" handle
// are mapped too, so a typo fix there can't silently drop a shop to the default.
// A shop on a plan that isn't listed here (or on no plan at all) falls back to
// the default.

// "Unlimited" on the listing; a finite ceiling still guards against a runaway
// tracking bill from a single misbehaving install.
export const ENTERPRISE_SHIPMENT_LIMIT = 1_000_000;

export const PLAN_SHIPMENT_LIMITS: Record<string, number> = {
  "free plan": 50,
  free: 50,
  pro: 500,
  business: 2_000,
  enterprise: ENTERPRISE_SHIPMENT_LIMIT,
  enterprice: ENTERPRISE_SHIPMENT_LIMIT,
  enterpirce: ENTERPRISE_SHIPMENT_LIMIT,
};

// Deliberately conservative: an unrecognized plan name means the Partner
// Dashboard and this file have drifted, and under-serving one shop is far
// cheaper to correct than an unbounded tracking bill.
export const DEFAULT_MONTHLY_SHIPMENT_LIMIT = 500;

export type ShopPlanFields = {
  planName: string | null;
  monthlyShipmentLimit: number | null;
};

export function monthlyShipmentLimitFor(shop: ShopPlanFields): number {
  // A per-shop override always wins, so a single merchant can be raised
  // without a deploy or a plan change.
  if (shop.monthlyShipmentLimit !== null) {
    return shop.monthlyShipmentLimit;
  }

  const planKey = shop.planName?.trim().toLowerCase();
  if (planKey && planKey in PLAN_SHIPMENT_LIMITS) {
    return PLAN_SHIPMENT_LIMITS[planKey];
  }

  return DEFAULT_MONTHLY_SHIPMENT_LIMIT;
}

// Allowances reset on the first of the calendar month in UTC. This is not the
// merchant's Shopify billing anniversary; it is chosen so the reset point is
// identical for every shop and can be reasoned about from a timestamp alone.
export function allowanceWindowStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

export const OVER_ALLOWANCE_REASON = "MONTHLY_SHIPMENT_LIMIT_REACHED";
