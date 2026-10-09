import type { PlanSummary } from "@/src/lib/data/types";

// Shown in place of (or above) a feature the shop's plan doesn't include. The
// link opens Shopify's Managed Pricing page in the top frame, since the app
// itself runs inside the Shopify admin iframe.
export function UpgradeBanner({
  plan,
  requiredPlan,
  title,
  body,
}: {
  plan: PlanSummary | null | undefined;
  requiredPlan: "Pro" | "Business";
  title: string;
  body: string;
}) {
  return (
    <div className="upgrade-banner" role="note">
      <div className="upgrade-copy">
        <strong>{title}</strong>
        <span className="microcopy">
          {body} Available on {requiredPlan} and above
          {plan ? ` (you're on ${plan.label})` : ""}.
        </span>
      </div>
      {plan?.upgradeUrl ? (
        <a className="button" href={plan.upgradeUrl} target="_top" rel="noreferrer">
          Upgrade to {requiredPlan}
        </a>
      ) : null}
    </div>
  );
}
