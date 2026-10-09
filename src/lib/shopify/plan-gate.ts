import { NextResponse } from "@/src/lib/next-response";
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  planFeaturesFor,
  planUpgradeUrl,
  type PlanFeatures,
  type PlanTier,
} from "@/src/lib/plans";

type GatedFeature = Exclude<keyof PlanFeatures, "monthlyShipments">;

const TIER_ORDER: PlanTier[] = ["free", "pro", "business", "enterprise"];

export const FEATURE_NAMES: Record<GatedFeature, string> = {
  multiCarrier: "Tracking more than one carrier",
  allExceptionTypes: "All exception types",
  priorityRules: "Custom priority rules",
  slack: "Slack alerts",
  dailyDigest: "Daily digest reports",
  customTemplates: "Custom notification templates",
  carrierReports: "Carrier performance reports",
};

// The cheapest plan that includes a feature, read from the plan table so it
// can't disagree with what the worker enforces.
export function minimumTierFor(feature: GatedFeature): PlanTier {
  return TIER_ORDER.find((tier) => PLAN_FEATURES[tier][feature]) ?? "enterprise";
}

// Returns a 403 the dashboard can turn into an upgrade prompt, or null when
// the shop's plan includes the feature.
export function planGateResponse(
  shop: { domain: string; planName: string | null },
  feature: GatedFeature,
): Response | null {
  if (planFeaturesFor(shop.planName)[feature]) {
    return null;
  }

  const requiredPlan = PLAN_LABELS[minimumTierFor(feature)];

  return NextResponse.json(
    {
      error: `${FEATURE_NAMES[feature]} ${feature === "allExceptionTypes" ? "are" : "is"} available on the ${requiredPlan} plan and above.`,
      code: "PLAN_UPGRADE_REQUIRED",
      requiredPlan,
      upgradeUrl: planUpgradeUrl(shop.domain),
    },
    { status: 403 },
  );
}
