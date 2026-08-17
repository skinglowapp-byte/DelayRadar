// Klaviyo integration.
//
// Merchants already own a branded, deliverable email channel; asking them to
// let us send customer email from our domain means worse-looking mail, a manual
// per-shop sender-verification step, and our deliverability reputation on the
// hook for their sends. Emitting an event into their Klaviyo instead makes
// DelayRadar a signal source: they build the flow, we tell them when to fire it.

const KLAVIYO_EVENTS_ENDPOINT = "https://a.klaviyo.com/api/events/";

// Klaviyo pins breaking changes to a dated revision header. Bump deliberately
// and re-test; leaving it unset means being opted into their latest.
const KLAVIYO_REVISION = "2024-10-15";

export const KLAVIYO_METRIC_NAME = "DelayRadar Delivery Exception";

export type KlaviyoEventInput = {
  apiKey: string;
  email: string;
  metricName?: string;
  // Deduplicates retries on Klaviyo's side: the same unique_id is only ever
  // recorded once, so a job retried after a network timeout cannot double-fire
  // a merchant's flow at their customer.
  uniqueId: string;
  occurredAt: Date;
  properties: Record<string, unknown>;
};

export type KlaviyoResult =
  | { status: "sent" }
  | { status: "failed"; error: string; retryable: boolean };

export async function sendKlaviyoEvent(
  input: KlaviyoEventInput,
): Promise<KlaviyoResult> {
  const body = {
    data: {
      type: "event",
      attributes: {
        properties: input.properties,
        time: input.occurredAt.toISOString(),
        unique_id: input.uniqueId,
        metric: {
          data: {
            type: "metric",
            attributes: { name: input.metricName ?? KLAVIYO_METRIC_NAME },
          },
        },
        profile: {
          data: {
            type: "profile",
            attributes: { email: input.email },
          },
        },
      },
    },
  };

  let response: Response;
  try {
    response = await fetch(KLAVIYO_EVENTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${input.apiKey}`,
        "Content-Type": "application/vnd.api+json",
        accept: "application/vnd.api+json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Network-level failure: nothing reached Klaviyo, so this is safe to retry.
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }

  if (response.status === 202 || response.ok) {
    return { status: "sent" };
  }

  const detail = (await response.text().catch(() => "")).slice(0, 300);

  // A bad key or malformed payload will fail identically forever; rate limits
  // and server errors will not. Only the latter is worth another attempt.
  const retryable = response.status === 429 || response.status >= 500;

  return {
    status: "failed",
    error: `Klaviyo responded ${response.status}: ${detail}`,
    retryable,
  };
}

// Verifies a key without emitting anything a merchant's flows could react to.
export async function verifyKlaviyoApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      "https://a.klaviyo.com/api/accounts/",
      {
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          accept: "application/vnd.api+json",
          revision: KLAVIYO_REVISION,
        },
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
