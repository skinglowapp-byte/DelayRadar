import { afterEach, describe, expect, it, vi } from "vitest";

import { sendKlaviyoEvent } from "./klaviyo";

const baseInput = {
  apiKey: "pk_test",
  email: "shopper@example.com",
  uniqueId: "shipment-1:2026-08-17T00:00:00.000Z",
  occurredAt: new Date("2026-08-17T00:00:00.000Z"),
  properties: { order_name: "#1001" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("sendKlaviyoEvent", () => {
  it("treats 202 Accepted as sent", async () => {
    stubFetch(async () => new Response(null, { status: 202 }));
    await expect(sendKlaviyoEvent(baseInput)).resolves.toEqual({ status: "sent" });
  });

  it("sends the unique_id so a retry cannot double-fire a merchant flow", async () => {
    const spy = stubFetch(async () => new Response(null, { status: 202 }));
    await sendKlaviyoEvent(baseInput);

    const body = JSON.parse(String(spy.mock.calls[0][1].body));
    expect(body.data.attributes.unique_id).toBe(baseInput.uniqueId);
    expect(body.data.attributes.profile.data.attributes.email).toBe(baseInput.email);
    expect(body.data.attributes.time).toBe("2026-08-17T00:00:00.000Z");
  });

  it("pins the revision header", async () => {
    const spy = stubFetch(async () => new Response(null, { status: 202 }));
    await sendKlaviyoEvent(baseInput);

    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.revision).toBeTruthy();
    expect(headers.Authorization).toBe("Klaviyo-API-Key pk_test");
  });

  it("marks an auth failure as not retryable", async () => {
    stubFetch(async () => new Response("bad key", { status: 401 }));
    const result = await sendKlaviyoEvent(baseInput);

    expect(result.status).toBe("failed");
    expect(result).toMatchObject({ retryable: false });
  });

  it("marks rate limiting and server errors as retryable", async () => {
    stubFetch(async () => new Response("slow down", { status: 429 }));
    await expect(sendKlaviyoEvent(baseInput)).resolves.toMatchObject({
      status: "failed",
      retryable: true,
    });

    stubFetch(async () => new Response("boom", { status: 503 }));
    await expect(sendKlaviyoEvent(baseInput)).resolves.toMatchObject({
      status: "failed",
      retryable: true,
    });
  });

  it("treats a network failure as retryable rather than throwing", async () => {
    stubFetch(async () => {
      throw new Error("ECONNRESET");
    });

    await expect(sendKlaviyoEvent(baseInput)).resolves.toMatchObject({
      status: "failed",
      retryable: true,
    });
  });
});
