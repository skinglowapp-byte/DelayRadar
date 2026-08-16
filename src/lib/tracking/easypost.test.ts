import { describe, expect, it } from "vitest";

import { classifyEasyPostTrackerEvent } from "./easypost";

function event(result: {
  status?: string;
  status_detail?: string;
  message?: string;
}) {
  return {
    id: "evt_1",
    description: "tracker.updated",
    result: {
      id: "trk_1",
      tracking_code: "1Z999",
      carrier: "UPS",
      status: result.status ?? null,
      status_detail: result.status_detail ?? null,
      tracking_details: [
        {
          status: result.status ?? null,
          status_detail: result.status_detail ?? null,
          message: result.message ?? null,
          datetime: "2026-08-16T00:00:00Z",
        },
      ],
    },
  } as Parameters<typeof classifyEasyPostTrackerEvent>[0];
}

describe("classifyEasyPostTrackerEvent", () => {
  it("classifies delivered with no exception and zero risk", () => {
    const c = classifyEasyPostTrackerEvent(event({ status: "delivered" }));
    expect(c.exceptionType).toBeNull();
    expect(c.riskScore).toBe(0);
  });

  it("distinguishes address issues from generic failed delivery", () => {
    const addr = classifyEasyPostTrackerEvent(
      event({ status: "failure", status_detail: "address_issue" }),
    );
    expect(addr.exceptionType).toBe("ADDRESS_ISSUE");

    const failed = classifyEasyPostTrackerEvent(event({ status: "failure" }));
    expect(failed.exceptionType).toBe("FAILED_DELIVERY");
  });

  it("classifies delays and lost-in-transit", () => {
    expect(
      classifyEasyPostTrackerEvent(event({ status_detail: "delayed" }))
        .exceptionType,
    ).toBe("DELAYED");
    expect(
      classifyEasyPostTrackerEvent(event({ status: "error" })).exceptionType,
    ).toBe("LOST_IN_TRANSIT");
  });

  it("treats in-transit as a non-exception", () => {
    const c = classifyEasyPostTrackerEvent(event({ status: "in_transit" }));
    expect(c.exceptionType).toBeNull();
    expect(c.normalizedStatus).toBe("IN_TRANSIT");
  });
});
