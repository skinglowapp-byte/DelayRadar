import { describe, expect, it } from "vitest";

import { evaluateShipmentPriority } from "./shipment-priority";

const base = {
  baseRiskScore: 38,
  orderValueCents: null,
  orderTags: null,
  shippingMethodLabel: null,
  priorityOrderValueThresholdCents: 15000,
  vipTagPattern: "vip",
  currencyCode: "USD",
};

describe("evaluateShipmentPriority", () => {
  it("leaves a standard order unboosted", () => {
    const result = evaluateShipmentPriority(base);
    expect(result.effectiveRiskScore).toBe(38);
    expect(result.priorityLabel).toBe("Standard");
  });

  it("boosts and labels a VIP order", () => {
    const result = evaluateShipmentPriority({ ...base, orderTags: "VIP, repeat" });
    expect(result.isVip).toBe(true);
    expect(result.effectiveRiskScore).toBe(56); // 38 + 18
    expect(result.priorityLabel).toBe("VIP");
  });

  it("boosts high-value and expedited orders and stacks them", () => {
    const result = evaluateShipmentPriority({
      ...base,
      orderValueCents: 20000,
      shippingMethodLabel: "Express Overnight",
    });
    expect(result.isHighValue).toBe(true);
    expect(result.isExpedited).toBe(true);
    expect(result.effectiveRiskScore).toBe(58); // 38 + 12 + 8
  });

  it("clamps the effective risk score at 99", () => {
    const result = evaluateShipmentPriority({
      ...base,
      baseRiskScore: 95,
      orderTags: "vip",
      orderValueCents: 30000,
      shippingMethodLabel: "priority",
    });
    expect(result.effectiveRiskScore).toBe(99);
  });
});
