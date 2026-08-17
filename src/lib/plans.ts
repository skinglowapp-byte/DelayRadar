// Monthly tracked-shipment allowances.
//
// Carrier tracking is billed per tracker, so cost scales with the merchant's
// shipment volume while a flat subscription does not. Without a ceiling, one
// high-volume install can cost more to serve than every paying shop combined.
// The allowance is enforced where the tracker is registered — see
// src/worker/process-job.ts.
//
// The keys MUST match the plan names configured in the Shopify Partner
// Dashboard under Managed Pricing, exactly. Shopify owns the prices; this file
// only maps a plan to what it is allowed to consume. A shop on a plan that
// isn't listed here (or on no plan at all) falls back to the default.

export const PLAN_SHIPMENT_LIMITS: Record<string, number> = {
  Starter: 500,
  Growth: 2_000,
  Scale: 6_000,
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

  if (shop.planName && shop.planName in PLAN_SHIPMENT_LIMITS) {
    return PLAN_SHIPMENT_LIMITS[shop.planName];
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
