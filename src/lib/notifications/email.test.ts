import { afterEach, describe, expect, it, vi } from "vitest";

import { hasEmailProvider, sendEmail } from "./email";

const baseInput = {
  to: "shopper@example.com",
  subject: "Your order is delayed",
  htmlBody: "<p>Hi</p>",
  textBody: "Hi",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function onlyResend() {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_FROM_EMAIL", "alerts@returnsenseapp.com");
  vi.stubEnv("POSTMARK_SERVER_TOKEN", "");
  vi.stubEnv("SENDGRID_API_KEY", "");
}

describe("sendEmail via Resend", () => {
  it("sends from the app address with the merchant's reply-to", async () => {
    onlyResend();
    const spy = stubFetch(async () => Response.json({ id: "msg_1" }));

    const result = await sendEmail({
      ...baseInput,
      sender: { name: "Aurora Threads", replyTo: "help@aurora.example" },
    });

    expect(result).toEqual({ provider: "resend", status: "sent", externalMessageId: "msg_1" });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe("Aurora Threads <alerts@returnsenseapp.com>");
    expect(body.to).toEqual(["shopper@example.com"]);
    expect(body.reply_to).toBe("help@aurora.example");
  });

  it("uses a shop's own address only once it is verified", async () => {
    onlyResend();
    const spy = stubFetch(async () => Response.json({ id: "msg_2" }));

    await sendEmail({
      ...baseInput,
      sender: { email: "orders@aurora.example", name: "Aurora", verified: false },
    });
    expect(JSON.parse(String(spy.mock.calls[0][1].body)).from).toBe(
      "Aurora <alerts@returnsenseapp.com>",
    );

    await sendEmail({
      ...baseInput,
      sender: { email: "orders@aurora.example", name: "Aurora", verified: true },
    });
    expect(JSON.parse(String(spy.mock.calls[1][1].body)).from).toBe(
      "Aurora <orders@aurora.example>",
    );
  });

  it("throws on a non-2xx so the job is retried", async () => {
    onlyResend();
    stubFetch(async () => new Response("bad", { status: 422 }));
    await expect(sendEmail(baseInput)).rejects.toThrow("Resend send failed with 422");
  });

  it("refuses to send without a from address", async () => {
    onlyResend();
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    stubFetch(async () => Response.json({ id: "x" }));
    await expect(sendEmail(baseInput)).rejects.toThrow("RESEND_FROM_EMAIL is not set.");
  });
});

describe("hasEmailProvider", () => {
  it("is false with no provider keys, so the UI can warn instead of silently skipping", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "");
    vi.stubEnv("SENDGRID_API_KEY", "");
    expect(hasEmailProvider()).toBe(false);
  });

  it("counts Resend as a provider", () => {
    onlyResend();
    expect(hasEmailProvider()).toBe(true);
  });
});
