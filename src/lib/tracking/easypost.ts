import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const trackingDetailSchema = z.object({
  status: z.string().nullish(),
  status_detail: z.string().nullish(),
  message: z.string().nullish(),
  datetime: z.string().nullish(),
});

const trackerSchema = z.object({
  id: z.string().optional(),
  tracking_code: z.string(),
  carrier: z.string().nullish(),
  status: z.string().nullish(),
  status_detail: z.string().nullish(),
  tracking_details: z.array(trackingDetailSchema).default([]),
});

const trackerEventSchema = z.object({
  id: z.string(),
  description: z.string(),
  result: trackerSchema,
});

export type EasyPostTrackerEvent = z.infer<typeof trackerEventSchema>;

type Classification = {
  normalizedStatus:
    | "PENDING"
    | "IN_TRANSIT"
    | "DELAYED"
    | "EXCEPTION"
    | "ACTION_REQUIRED"
    | "AVAILABLE_FOR_PICKUP"
    | "DELIVERED"
    | "LOST";
  exceptionType:
    | "DELAYED"
    | "FAILED_DELIVERY"
    | "ADDRESS_ISSUE"
    | "AVAILABLE_FOR_PICKUP"
    | "LOST_IN_TRANSIT"
    | "RETURN_TO_SENDER"
    | "OTHER"
    | null;
  actionRequired: boolean;
  riskScore: number;
};

function safeCompare(left: string, right: string) {
  try {
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

export function verifyEasyPostWebhookSignature(
  request: Request,
  rawBody: string,
) {
  const secret = process.env.EASYPOST_WEBHOOK_SECRET;

  if (!secret) {
    console.warn("EASYPOST_WEBHOOK_SECRET is not set — rejecting webhook.");
    return false;
  }

  const signatureV2 = request.headers.get("x-hmac-signature-v2");

  if (signatureV2) {
    const timestamp = request.headers.get("x-timestamp") ?? "";
    const path = request.headers.get("x-path") ?? new URL(request.url).pathname;
    const stringToSign = `${timestamp}${request.method.toUpperCase()}${path}${rawBody}`;
    const digest = createHmac("sha256", secret)
      .update(stringToSign)
      .digest("hex");

    return safeCompare(
      signatureV2.toLowerCase(),
      `hmac-sha256-hex=${digest}`.toLowerCase(),
    );
  }

  const signature = request.headers.get("x-hmac-signature");

  if (!signature) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const normalizedHeader = signature.replace(/^hmac-sha256-hex=/i, "");

  return safeCompare(digest.toLowerCase(), normalizedHeader.toLowerCase());
}

export function parseEasyPostTrackerEvent(payload: unknown) {
  return trackerEventSchema.parse(payload);
}

export async function createEasyPostTracker(input: {
  trackingCode: string;
  carrier?: string | null;
}) {
  const apiKey = process.env.EASYPOST_API_KEY;

  if (!apiKey) {
    throw new Error("EASYPOST_API_KEY is not configured.");
  }

  const response = await fetch("https://api.easypost.com/v2/trackers", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tracker: {
        tracking_code: input.trackingCode,
        carrier: input.carrier ?? undefined,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`EasyPost tracker creation failed with ${response.status}`);
  }

  return trackerSchema.parse(await response.json());
}

export function classifyEasyPostTrackerEvent(event: EasyPostTrackerEvent): Classification {
  const latestDetail = event.result.tracking_details.at(-1);
  const status = (event.result.status ?? latestDetail?.status ?? "unknown").toLowerCase();
  const detail = (
    event.result.status_detail ??
    latestDetail?.status_detail ??
    ""
  ).toLowerCase();
  const message = (latestDetail?.message ?? "").toLowerCase();

  if (status === "delivered") {
    return {
      normalizedStatus: "DELIVERED",
      exceptionType: null,
      actionRequired: false,
      riskScore: 0,
    };
  }

  if (status === "available_for_pickup") {
    return {
      normalizedStatus: "AVAILABLE_FOR_PICKUP",
      exceptionType: "AVAILABLE_FOR_PICKUP",
      actionRequired: true,
      riskScore: 45,
    };
  }

  if (status === "return_to_sender") {
    return {
      normalizedStatus: "EXCEPTION",
      exceptionType: "RETURN_TO_SENDER",
      actionRequired: true,
      riskScore: 90,
    };
  }

  if (status === "failure") {
    const addressIssue =
      detail.includes("address") || message.includes("address");

    return {
      normalizedStatus: "ACTION_REQUIRED",
      exceptionType: addressIssue ? "ADDRESS_ISSUE" : "FAILED_DELIVERY",
      actionRequired: true,
      riskScore: addressIssue ? 78 : 72,
    };
  }

  if (status === "error" || detail === "lost") {
    return {
      normalizedStatus: "LOST",
      exceptionType: "LOST_IN_TRANSIT",
      actionRequired: true,
      riskScore: 96,
    };
  }

  if (
    detail === "delayed" ||
    detail === "transit_exception" ||
    detail === "weather_delay" ||
    message.includes("delay")
  ) {
    return {
      normalizedStatus: "DELAYED",
      exceptionType: "DELAYED",
      actionRequired: false,
      riskScore: 38,
    };
  }

  if (status === "in_transit" || status === "out_for_delivery") {
    return {
      normalizedStatus: "IN_TRANSIT",
      exceptionType: null,
      actionRequired: false,
      riskScore: 12,
    };
  }

  return {
    normalizedStatus: "PENDING",
    exceptionType: null,
    actionRequired: false,
    riskScore: 6,
  };
}
