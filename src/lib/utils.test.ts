import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  interpolateTemplate,
  safeEqual,
  safeJsonParse,
} from "./utils";

describe("safeEqual", () => {
  it("is true for equal strings and false otherwise", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreu")).toBe(false);
  });

  it("is false for length mismatches", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("interpolateTemplate", () => {
  it("substitutes known variables and blanks unknown ones", () => {
    expect(
      interpolateTemplate("Hi {{name}}, order {{order}}", {
        name: "Sam",
        order: "#1001",
      }),
    ).toBe("Hi Sam, order #1001");
    expect(interpolateTemplate("{{missing}}!", {})).toBe("!");
  });
});

describe("escapeHtml", () => {
  it("escapes angle brackets and ampersands", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON and returns null for invalid", () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonParse("{not json")).toBeNull();
  });
});
