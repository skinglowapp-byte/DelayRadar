import { describe, expect, it } from "vitest";

import {
  allowanceWindowStart,
  DEFAULT_MONTHLY_SHIPMENT_LIMIT,
  monthlyShipmentLimitFor,
  PLAN_SHIPMENT_LIMITS,
} from "./plans";

describe("monthlyShipmentLimitFor", () => {
  it("uses the allowance for a known plan", () => {
    expect(
      monthlyShipmentLimitFor({ planName: "Growth", monthlyShipmentLimit: null }),
    ).toBe(PLAN_SHIPMENT_LIMITS.Growth);
  });

  it("falls back to the default for an unrecognized plan", () => {
    expect(
      monthlyShipmentLimitFor({
        planName: "Legacy Plan From The Dashboard",
        monthlyShipmentLimit: null,
      }),
    ).toBe(DEFAULT_MONTHLY_SHIPMENT_LIMIT);
  });

  it("falls back to the default when no plan is cached yet", () => {
    expect(
      monthlyShipmentLimitFor({ planName: null, monthlyShipmentLimit: null }),
    ).toBe(DEFAULT_MONTHLY_SHIPMENT_LIMIT);
  });

  it("lets a per-shop override beat the plan allowance", () => {
    expect(
      monthlyShipmentLimitFor({ planName: "Starter", monthlyShipmentLimit: 25_000 }),
    ).toBe(25_000);
  });

  it("honours an override of zero rather than treating it as unset", () => {
    expect(
      monthlyShipmentLimitFor({ planName: "Scale", monthlyShipmentLimit: 0 }),
    ).toBe(0);
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
