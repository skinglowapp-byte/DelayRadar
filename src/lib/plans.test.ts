import { describe, expect, it } from "vitest";

import {
  allowanceWindowStart,
  carrierKey,
  effectivePrioritySettings,
  ENTERPRISE_SHIPMENT_LIMIT,
  isExceptionTypeIncluded,
  monthlyShipmentLimitFor,
  PLAN_FEATURES,
  PLAN_SHIPMENT_LIMITS,
  planFeaturesFor,
  planTierFor,
  planUpgradeUrl,
} from "./plans";

describe("monthlyShipmentLimitFor", () => {
  const limit = (planName: string | null) =>
    monthlyShipmentLimitFor({ planName, monthlyShipmentLimit: null });

  it("uses the allowance for each Partner Dashboard plan name", () => {
    expect(limit("Free Plan")).toBe(50);
    expect(limit("Pro")).toBe(500);
    expect(limit("Business")).toBe(2_000);
    expect(limit("Enterprise")).toBe(ENTERPRISE_SHIPMENT_LIMIT);
  });

  it("matches plan names case-insensitively and tolerates the dashboard typo", () => {
    expect(limit(" business ")).toBe(2_000);
    expect(limit("Enterprice")).toBe(ENTERPRISE_SHIPMENT_LIMIT);
    expect(limit("enterpirce")).toBe(ENTERPRISE_SHIPMENT_LIMIT);
  });

  it("treats a shop with no subscription as Free", () => {
    expect(limit(null)).toBe(PLAN_SHIPMENT_LIMITS.free);
  });

  it("gives an unrecognised paid plan Pro rather than locking it to Free", () => {
    expect(limit("Legacy Plan From The Dashboard")).toBe(PLAN_SHIPMENT_LIMITS.pro);
  });

  it("lets a per-shop override beat the plan allowance", () => {
    expect(
      monthlyShipmentLimitFor({ planName: "Pro", monthlyShipmentLimit: 25_000 }),
    ).toBe(25_000);
  });

  it("honours an override of zero rather than treating it as unset", () => {
    expect(
      monthlyShipmentLimitFor({ planName: "Business", monthlyShipmentLimit: 0 }),
    ).toBe(0);
  });
});

describe("planTierFor / planFeaturesFor", () => {
  it("maps the reviewers' private shopify-test plan to Enterprise", () => {
    expect(planTierFor("shopify-test")).toBe("enterprise");
    expect(planTierFor("Test plan")).toBe("enterprise");
  });

  it("maps plan handles as well as display names", () => {
    expect(planTierFor("free-plan")).toBe("free");
    expect(planTierFor("business")).toBe("business");
  });

  it("ignores spaces, hyphens and underscores in plan names", () => {
    expect(planTierFor("Shopify Test")).toBe("enterprise");
    expect(planTierFor("free_plan")).toBe("free");
  });

  it("matches the listing: each tier adds features, never removes them", () => {
    const order = ["free", "pro", "business", "enterprise"] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = PLAN_FEATURES[order[i - 1]];
      const higher = PLAN_FEATURES[order[i]];
      for (const key of Object.keys(lower) as (keyof typeof lower)[]) {
        if (typeof lower[key] === "boolean" && lower[key]) {
          expect(higher[key]).toBe(true);
        }
      }
      expect(higher.monthlyShipments).toBeGreaterThan(lower.monthlyShipments);
    }
  });

  it("gates Slack, digest and priority rules at Pro; templates and reports at Business", () => {
    expect(planFeaturesFor(null)).toMatchObject({ slack: false, dailyDigest: false, priorityRules: false, multiCarrier: false });
    expect(planFeaturesFor("Pro")).toMatchObject({ slack: true, dailyDigest: true, priorityRules: true, customTemplates: false, carrierReports: false });
    expect(planFeaturesFor("Business")).toMatchObject({ customTemplates: true, carrierReports: true });
  });
});

describe("isExceptionTypeIncluded", () => {
  it("limits Free to delayed, failed delivery and lost in transit", () => {
    const free = planFeaturesFor(null);
    expect(isExceptionTypeIncluded(free, "DELAYED")).toBe(true);
    expect(isExceptionTypeIncluded(free, "FAILED_DELIVERY")).toBe(true);
    expect(isExceptionTypeIncluded(free, "LOST_IN_TRANSIT")).toBe(true);
    expect(isExceptionTypeIncluded(free, "ADDRESS_ISSUE")).toBe(false);
    expect(isExceptionTypeIncluded(free, "NO_MOVEMENT")).toBe(false);
  });

  it("includes every type from Pro up", () => {
    expect(isExceptionTypeIncluded(planFeaturesFor("Pro"), "NO_MOVEMENT")).toBe(true);
  });
});

describe("effectivePrioritySettings", () => {
  const stored = { priorityOrderValueThresholdCents: 50_000, vipTagPattern: "gold" };

  it("holds Free to the defaults but keeps stored values for an upgrade", () => {
    expect(effectivePrioritySettings(planFeaturesFor(null), stored)).toEqual({
      priorityOrderValueThresholdCents: 15_000,
      vipTagPattern: "vip",
    });
  });

  it("applies the shop's own rules from Pro up", () => {
    expect(effectivePrioritySettings(planFeaturesFor("Pro"), stored)).toEqual(stored);
  });
});

describe("carrierKey", () => {
  it("normalises carrier labels so one carrier locks once", () => {
    expect(carrierKey(" USPS ")).toBe(carrierKey("usps"));
    expect(carrierKey("  ")).toBeNull();
  });

  it("treats Shopify and EasyPost spellings of a carrier as one family", () => {
    expect(carrierKey("DHL Express")).toBe(carrierKey("DHLExpress"));
    expect(carrierKey("DHL eCommerce")).toBe("dhl");
    expect(carrierKey("Canada Post")).toBe(carrierKey("CanadaPost"));
    expect(carrierKey("FedEx SmartPost")).toBe("fedex");
  });

  it("keeps UPS and USPS apart", () => {
    expect(carrierKey("UPS Mail Innovations")).toBe("ups");
    expect(carrierKey("USPS")).toBe("usps");
  });

  it("falls back to the normalised label for carriers outside the list", () => {
    expect(carrierKey("Local Courier Co.")).toBe("localcourierco");
  });
});

describe("planUpgradeUrl", () => {
  it("points at the Managed Pricing plan picker for the store", () => {
    expect(planUpgradeUrl("acme-store.myshopify.com")).toBe(
      "https://admin.shopify.com/store/acme-store/charges/delayradar/pricing_plans",
    );
  });
});

describe("allowanceWindowStart", () => {
  it("returns midnight UTC on the first of the month", () => {
    const start = allowanceWindowStart(new Date("2026-08-17T15:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("does not roll back a year at the January boundary", () => {
    const start = allowanceWindowStart(new Date("2026-01-01T00:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("uses UTC, not the host timezone, for a late-month local date", () => {
    // 23:30 on the 31st in UTC+2 is still the 31st in UTC, not the 1st.
    const start = allowanceWindowStart(new Date("2026-07-31T21:30:00.000Z"));
    expect(start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
