// Monthly tracked-shipment allowances.
//
// Carrier tracking is billed per tracker, so cost scales with the merchant's
// shipment volume while a flat subscription does not. Without a ceiling, one
// high-volume install can cost more to serve than every paying shop combined.
// The allowance is enforced where the tracker is registered — see
// src/worker/process-job.ts.
//
// Plans as configured in the Shopify Partner Dashboard under Managed Pricing,
// which is where Shopify owns the prices. Every limit and feature gate in the
// app reads from PLAN_FEATURES, so the listing, the worker, the API routes and
// the dashboard can't drift from each other.
export type PlanTier = "free" | "pro" | "business" | "enterprise";

export type PlanFeatures = {
  monthlyShipments: number;
  // Free tracks one carrier (the first one the shop ships with).
  multiCarrier: boolean;
  // Free sees and is alerted about FREE_EXCEPTION_TYPES only.
  allExceptionTypes: boolean;
  // VIP tag and order-value priority rules are configurable (Free uses defaults).
  priorityRules: boolean;
  slack: boolean;
  dailyDigest: boolean;
  customTemplates: boolean;
  carrierReports: boolean;
};

// "Unlimited" on the listing; a finite ceiling still guards against a runaway
// tracking bill from a single misbehaving install.
export const ENTERPRISE_SHIPMENT_LIMIT = 1_000_000;

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  free: {
    monthlyShipments: 50,
    multiCarrier: false,
    allExceptionTypes: false,
    priorityRules: false,
    slack: false,
    dailyDigest: false,
    customTemplates: false,
    carrierReports: false,
  },
  pro: {
    monthlyShipments: 500,
    multiCarrier: true,
    allExceptionTypes: true,
    priorityRules: true,
    slack: true,
    dailyDigest: true,
    customTemplates: false,
    carrierReports: false,
  },
  business: {
    monthlyShipments: 2_000,
    multiCarrier: true,
    allExceptionTypes: true,
    priorityRules: true,
    slack: true,
    dailyDigest: true,
    customTemplates: true,
    carrierReports: true,
  },
  enterprise: {
    monthlyShipments: ENTERPRISE_SHIPMENT_LIMIT,
    multiCarrier: true,
    allExceptionTypes: true,
    priorityRules: true,
    slack: true,
    dailyDigest: true,
    customTemplates: true,
    carrierReports: true,
  },
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

// Exception types a Free shop sees and is notified about. Every type is still
// recorded, so upgrading reveals the full history.
export const FREE_EXCEPTION_TYPES = [
  "DELAYED",
  "FAILED_DELIVERY",
  "LOST_IN_TRANSIT",
] as const;

// Matched case-insensitively against the subscription name Shopify returns.
// Both display names and plan handles are listed, including the dashboard's
// old "Enterprice"/"enterpirce" typo, so a rename there can't silently drop a
// paying shop to Free. "shopify-test" ("Shopify Test", shown as "Test plan")
// is the private $0 plan Shopify's app reviewers install with; they need to
// see every feature.
// Keys are normalised by planNameKey (lower case, letters and digits only), so
// "Free Plan", "free-plan" and "free_plan" are one entry.
const TIER_BY_PLAN_NAME: Record<string, PlanTier> = {
  freeplan: "free",
  free: "free",
  pro: "pro",
  business: "business",
  enterprise: "enterprise",
  enterprice: "enterprise",
  enterpirce: "enterprise",
  shopifytest: "enterprise",
  testplan: "enterprise",
};

function planNameKey(planName: string | null | undefined): string {
  return (planName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// A shop with no active subscription is on Free: the $0 plan may not surface
// as a subscription at all. An unrecognised, non-empty name means the Partner
// Dashboard and this file have drifted; that shop is paying for *something*,
// so it gets Pro rather than being locked down to Free.
const UNRECOGNISED_PLAN_TIER: PlanTier = "pro";

export function planTierFor(planName: string | null | undefined): PlanTier {
  const key = planNameKey(planName);

  if (!key) {
    return "free";
  }

  return TIER_BY_PLAN_NAME[key] ?? UNRECOGNISED_PLAN_TIER;
}

export function planFeaturesFor(planName: string | null | undefined): PlanFeatures {
  return PLAN_FEATURES[planTierFor(planName)];
}

export function isExceptionTypeIncluded(
  features: PlanFeatures,
  exceptionType: string | null | undefined,
): boolean {
  if (!exceptionType) {
    return false;
  }

  return (
    features.allExceptionTypes ||
    (FREE_EXCEPTION_TYPES as readonly string[]).includes(exceptionType)
  );
}

// Defaults a shop on a plan without priority rules is held to, whatever is
// stored (stored values are kept so an upgrade restores them).
export const DEFAULT_PRIORITY_ORDER_VALUE_CENTS = 15_000;
export const DEFAULT_VIP_TAG_PATTERN = "vip";

export function effectivePrioritySettings(
  features: PlanFeatures,
  shop: { priorityOrderValueThresholdCents: number | null; vipTagPattern: string | null },
) {
  if (!features.priorityRules) {
    return {
      priorityOrderValueThresholdCents: DEFAULT_PRIORITY_ORDER_VALUE_CENTS,
      vipTagPattern: DEFAULT_VIP_TAG_PATTERN,
    };
  }

  return {
    priorityOrderValueThresholdCents:
      shop.priorityOrderValueThresholdCents ?? DEFAULT_PRIORITY_ORDER_VALUE_CENTS,
    vipTagPattern: shop.vipTagPattern?.trim() || DEFAULT_VIP_TAG_PATTERN,
  };
}

// Carrier families for the single-carrier limit. Shopify's tracking-company
// label ("DHL Express") and EasyPost's carrier code ("DHLExpress") must lock
// to the same carrier, and a merchant's DHL eCommerce and DHL Express
// shipments count as one carrier, DHL.
const CARRIER_FAMILIES = [
  "usps",
  "ups",
  "fedex",
  "dhl",
  "amazon",
  "canadapost",
  "royalmail",
  "australiapost",
  "ontrac",
  "lasership",
  "purolator",
];

export function carrierKey(carrier: string | null | undefined): string | null {
  const key = (carrier ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!key) {
    return null;
  }

  return CARRIER_FAMILIES.find((family) => key.startsWith(family)) ?? key;
}

export const PLAN_SHIPMENT_LIMITS: Record<PlanTier, number> = {
  free: PLAN_FEATURES.free.monthlyShipments,
  pro: PLAN_FEATURES.pro.monthlyShipments,
  business: PLAN_FEATURES.business.monthlyShipments,
  enterprise: PLAN_FEATURES.enterprise.monthlyShipments,
};

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

  return planFeaturesFor(shop.planName).monthlyShipments;
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
export const CARRIER_NOT_IN_PLAN_REASON = "CARRIER_NOT_IN_PLAN";

// Builds the Shopify-hosted plan picker URL for Managed Pricing.
export function planUpgradeUrl(shopDomain: string): string {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/delayradar/pricing_plans`;
}
