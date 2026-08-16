import { describe, expect, it } from "vitest";

import { toNumericId } from "./shopify-fulfillment";

describe("toNumericId", () => {
  it("extracts the numeric id from a Shopify GID", () => {
    expect(toNumericId("gid://shopify/Order/123456")).toBe("123456");
    expect(toNumericId("gid://shopify/Fulfillment/98765")).toBe("98765");
  });

  it("passes through bare numeric ids (webhook form)", () => {
    expect(toNumericId(123456)).toBe("123456");
    expect(toNumericId("123456")).toBe("123456");
  });

  it("returns null for empty / nullish values", () => {
    expect(toNumericId(null)).toBeNull();
    expect(toNumericId(undefined)).toBeNull();
    expect(toNumericId("")).toBeNull();
  });
});
