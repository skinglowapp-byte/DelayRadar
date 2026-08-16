import { describe, expect, it } from "vitest";

import { nextDigestRunAt, startOfLocalDay } from "./schedule";

function hourInZone(date: Date, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
}

describe("nextDigestRunAt", () => {
  it("schedules the next occurrence of the local digest hour", () => {
    const now = new Date("2026-08-16T18:00:00Z"); // 2pm ET
    const at = nextDigestRunAt({
      timeZone: "America/New_York",
      digestHour: 9,
      now,
    });
    // 9am ET already passed today, so it must be in the future.
    expect(at.getTime()).toBeGreaterThan(now.getTime());
    expect(hourInZone(at, "America/New_York")).toBe(9);
  });

  it("falls back to UTC for an invalid time zone", () => {
    const now = new Date("2026-08-16T00:00:00Z");
    const at = nextDigestRunAt({ timeZone: "Not/AZone", digestHour: 6, now });
    expect(hourInZone(at, "UTC")).toBe(6);
  });
});

describe("startOfLocalDay", () => {
  it("returns local midnight for the zone", () => {
    const now = new Date("2026-08-16T18:00:00Z"); // 2pm ET
    const midnight = startOfLocalDay("America/New_York", now);
    expect(hourInZone(midnight, "America/New_York")).toBe(0);
    expect(midnight.getTime()).toBeLessThan(now.getTime());
  });
});
