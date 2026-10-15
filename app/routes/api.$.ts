import { ProcessingStatus, WebhookSource } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { GET as getBootstrap } from "../api/app/bootstrap/route";
import { POST as postDigest } from "../api/app/digest/route";
import { GET as getHealth } from "../api/app/health/route";
import { POST as postRetryJobs } from "../api/app/jobs/retry/route";
import { POST as postManualNotification } from "../api/app/notifications/manual/route";
import { POST as postPing } from "../api/app/ping/route";
import { POST as postKlaviyoSettings } from "../api/app/settings/klaviyo/route";
import { POST as postNotificationSettings } from "../api/app/settings/notifications/route";
import { POST as postPrioritySettings } from "../api/app/settings/priority/route";
import { POST as postSenderSettings } from "../api/app/settings/sender/route";
import { POST as postSlackSettings } from "../api/app/settings/slack/route";
import { POST as postSlackTest } from "../api/app/settings/slack/test/route";
import { POST as postSync } from "../api/app/sync/route";
import { POST as postTemplates } from "../api/app/templates/route";
import { POST as postTemplateTest } from "../api/app/templates/test/route";
import { POST as postWorkflow } from "../api/app/workflow/route";
import { GET as getCronDigests } from "../api/cron/digests/route";
import { GET as getCronWorker } from "../api/cron/worker/route";
import { POST as postEasyPostWebhook } from "../api/webhooks/easypost/route";
import { authenticate } from "../shopify.server";

import { prisma } from "@/src/lib/prisma";
import { rateLimit, rateLimitKeyFromRequest } from "@/src/lib/rate-limit";
import {
  dispatchShopifyTopic,
  SUPPORTED_SHOPIFY_TOPICS,
} from "@/src/lib/webhooks/shopify-dispatch";

// Persist only non-sensitive webhook headers for auditing. Never store the
// HMAC/signature headers or cookies — they are useless after verification and
// are needless secret/PII retention.
const AUDIT_HEADER_ALLOWLIST = new Set([
  "x-shopify-topic",
  "x-shopify-webhook-id",
  "x-shopify-api-version",
  "x-shopify-triggered-at",
  "x-shopify-shop-domain",
  "content-type",
  "user-agent",
]);

function safeWebhookHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    if (AUDIT_HEADER_ALLOWLIST.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  return headers;
}

const getRoutes: Record<string, (request: Request) => Promise<Response>> = {
  "/api/app/bootstrap": getBootstrap,
  "/api/app/health": getHealth,
  "/api/cron/digests": getCronDigests,
  "/api/cron/worker": getCronWorker,
};

const postRoutes: Record<string, (request: Request) => Promise<Response>> = {
  "/api/app/digest": postDigest,
  "/api/app/jobs/retry": postRetryJobs,
  "/api/app/notifications/manual": postManualNotification,
  "/api/app/ping": postPing,
  "/api/app/settings/notifications": postNotificationSettings,
  "/api/app/settings/priority": postPrioritySettings,
  "/api/app/settings/klaviyo": postKlaviyoSettings,
  "/api/app/settings/sender": postSenderSettings,
  "/api/app/settings/slack": postSlackSettings,
  "/api/app/settings/slack/test": postSlackTest,
  "/api/app/sync": postSync,
  "/api/app/templates": postTemplates,
  "/api/app/templates/test": postTemplateTest,
  "/api/app/workflow": postWorkflow,
  "/api/webhooks/easypost": postEasyPostWebhook,
};

async function handleLegacyAuthRoute(request: Request) {
  const url = new URL(request.url);
  const redirectUrl = new URL(
    url.pathname === "/api/auth/callback" ? "/auth/callback" : "/app",
    url.origin,
  );

  url.searchParams.forEach((value, key) => {
    redirectUrl.searchParams.append(key, value);
  });

  return Response.redirect(redirectUrl.toString(), 302);
}


async function handleShopifyWebhook(request: Request) {
  const rawTopic = request.headers.get("x-shopify-topic") ?? "";
  const normalizedTopic = rawTopic.toLowerCase();
  const webhookId = request.headers.get("x-shopify-webhook-id");

  let payload: unknown;
  let shop: string;

  try {
    const result = await authenticate.webhook(request);
    payload = result.payload;
    shop = result.shop;
  } catch (error) {
    // authenticate.webhook() throws on invalid HMAC. Return 401 so
    // Shopify's automated app review checker sees a proper rejection.
    if (error instanceof Response) {
      return error;
    }
    return new Response(
      JSON.stringify({ error: "Webhook authentication failed." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!SUPPORTED_SHOPIFY_TOPICS.has(normalizedTopic)) {
    return Response.json(
      { error: `Unsupported Shopify webhook topic: ${normalizedTopic || "unknown"}.` },
      { status: 400 },
    );
  }

  if (!prisma) {
    await dispatchShopifyTopic(normalizedTopic, { shop, payload });
    return new Response(null, { status: 200 });
  }

  // Shopify gives up on a delivery after 5 seconds and counts it as failed.
  // A cold function plus a suspended Neon compute can eat most of that, so
  // the only work done before replying is one write that durably records the
  // delivery. The actual processing runs after the response (waitUntil), and
  // the worker retries anything that fails there.
  const idempotencyKey = webhookId ? `shopify:${webhookId}` : null;
  const data = {
    source: WebhookSource.SHOPIFY,
    topic: rawTopic || "unknown",
    shopDomain: shop,
    idempotencyKey,
    headers: safeWebhookHeaders(request),
    payload: (payload ?? {}) as object,
  };

  let inbound: { id: string; status: ProcessingStatus };
  try {
    inbound = idempotencyKey
      ? await prisma.inboundWebhook.upsert({
          where: { idempotencyKey },
          create: data,
          update: {},
          select: { id: true, status: true },
        })
      : await prisma.inboundWebhook.create({
          data,
          select: { id: true, status: true },
        });
  } catch (error) {
    // Concurrent retry raced us to the insert; that request owns processing.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return new Response(null, { status: 200 });
    }
    throw error;
  }

  // Only short-circuit a delivery we already processed successfully. A row
  // left at FAILED/PENDING from a prior attempt is reprocessed on Shopify's
  // retry (same webhook id) rather than silently dropped.
  if (inbound.status !== ProcessingStatus.PROCESSED) {
    waitUntil(processShopifyInbound(inbound.id, normalizedTopic, shop, payload));
  }

  return new Response(null, { status: 200 });
}

async function processShopifyInbound(
  inboundId: string,
  normalizedTopic: string,
  shop: string,
  payload: unknown,
) {
  if (!prisma) return;

  try {
    await dispatchShopifyTopic(normalizedTopic, { shop, payload });

    // Attribute the audit row to the shop so per-shop health counts work.
    // Looked up after the fact so it stays off the response path. A
    // shop/redact delivery deletes its own row, hence updateMany.
    const shopRecord = await prisma.shop.findUnique({
      where: { domain: shop },
      select: { id: true },
    });
    await prisma.inboundWebhook.updateMany({
      where: { id: inboundId },
      data: {
        status: ProcessingStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
        shopId: shopRecord?.id ?? null,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Webhook processing failed.";
    console.error(`[shopify-webhook] ${normalizedTopic} for ${shop} failed: ${errorMessage}`);
    await prisma.inboundWebhook
      .updateMany({
        where: { id: inboundId },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage,
          retryCount: { increment: 1 },
        },
      })
      .catch(() => undefined);
  }
}

function enforceRateLimit(request: Request, pathname: string) {
  // Skip rate limiting for webhooks and cron (they have their own auth).
  if (pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/cron/")) {
    return null;
  }

  const key = rateLimitKeyFromRequest(request);
  const result = rateLimit(key, { windowMs: 60_000, max: 40 });

  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again shortly." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
        },
      },
    );
  }

  return null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;

  if (
    pathname === "/api/auth/start" ||
    pathname === "/api/auth/callback"
  ) {
    return handleLegacyAuthRoute(request);
  }

  const limited = enforceRateLimit(request, pathname);
  if (limited) return limited;

  const handler = getRoutes[pathname];

  if (!handler) {
    return new Response("Not Found", { status: 404 });
  }

  return handler(request);
}

export async function action({ request }: ActionFunctionArgs) {
  const pathname = new URL(request.url).pathname;

  if (pathname === "/api/webhooks/shopify") {
    return handleShopifyWebhook(request);
  }

  const limited = enforceRateLimit(request, pathname);
  if (limited) return limited;

  const handler = postRoutes[pathname];

  if (!handler) {
    return new Response("Not Found", { status: 404 });
  }

  return handler(request);
}
