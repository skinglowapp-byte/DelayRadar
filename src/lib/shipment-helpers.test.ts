import { describe, expect, it } from "vitest";

import { checkpointDate, noMovementRiskScore } from "./shipment-helpers";

describe("noMovementRiskScore", () => {
  it("escalates with age past the threshold", () => {
    expect(noMovementRiskScore(72, 72)).toBe(58);
    expect(noMovementRiskScore(72 + 24, 72)).toBe(72);
    expect(noMovementRiskScore(72 + 48, 72)).toBe(84);
  });
});

describe("checkpointDate", () => {
  it("prefers the latest checkpoint, falling back to updatedAt", () => {
    const checkpoint = new Date("2026-08-10T00:00:00Z");
    const updated = new Date("2026-08-16T00:00:00Z");
    expect(
      checkpointDate({ latestCheckpointAt: checkpoint, updatedAt: updated }),
    ).toBe(checkpoint);
    expect(
      checkpointDate({ latestCheckpointAt: null, updatedAt: updated }),
    ).toBe(updated);
  });
});
