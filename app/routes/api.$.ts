import { ProcessingStatus, WebhookSource } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { GET as getBootstrap } from "../api/app/bootstrap/route";
import { POST as postDigest } from "../api/app/digest/route";
import { GET as getHealth } from "../api/app/health/route";
import { POST as postRetryJobs } from "../api/app/jobs/retry/route";
import { POST as postManualNotification } from "../api/app/notifications/manual/route";
import { POST as postPing } from "../api/app/ping/route";
import { POST as postNotificationSettings } from "../api/app/settings/notifications/route";
import { POST as postPrioritySettings } from "../api/app/settings/priority/route";
import { POST as postSlackSettings } from "../api/app/settings/slack/route";
import { POST as postSlackTest } from "../api/app/settings/slack/test/route";
import { POST as postSync } from "../api/app/sync/route";
import { POST as postTemplates } from "../api/app/templates/route";
import { POST as postTemplateTest } from "../api/app/templates/test/route";
import { POST as postWorkflow } from "../api/app/workflow/route";
import { GET as getCronDigests } from "../api/cron/digests/route";
import { GET as getCronWorker } from "../api/cron/worker/route";
import { POST as postEasyPostWebhook } from "../api/webhooks/easypost/route";
import db from "../db.server";
import { authenticate } from "../shopify.server";

import { prisma } from "@/src/lib/prisma";
import { ingestShopifyFulfillmentWebhook } from "@/src/lib/processors/shopify-fulfillment";
import { rateLimit, rateLimitKeyFromRequest } from "@/src/lib/rate-limit";

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

type ShopifyWebhookSession = Awaited<
  ReturnType<typeof authenticate.webhook>
>["session"];

async function dispatchShopifyTopic(
  normalizedTopic: string,
  ctx: {
    shop: string;
    session: ShopifyWebhookSession;
    payload: unknown;
  },
) {
  const { shop, session, payload } = ctx;

  if (normalizedTopic === "app/uninstalled") {
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }
    if (prisma) {
      await prisma.shop.updateMany({
        where: { domain: shop },
        data: {
          isInstalled: false,
          offlineAccessToken: null,
          uninstalledAt: new Date(),
        },
      });
    }
    return;
  }

  if (normalizedTopic === "app/scopes_update") {
    const currentScopes = Array.isArray((payload as { current?: unknown }).current)
      ? ((payload as { current: string[] }).current ?? []).join(",")
      : "";

    if (session) {
      await db.session.updateMany({
        where: { id: session.id },
        data: { scope: currentScopes },
      });
    }
    if (prisma && currentScopes) {
      await prisma.shop.updateMany({
        where: { domain: shop },
        data: { scopes: currentScopes },
      });
    }
    return;
  }

  if (normalizedTopic === "customers/data_request") {
    // GDPR: compile the data we hold about this customer so the merchant can
    // fulfil the request. DelayRadar has no automated export channel, so we
    // log a structured, actionable summary (record ids, not raw PII) for the
    // operator to action within the 30-day window.
    if (!prisma) return;
    const requestPayload = payload as {
      customer?: { email?: string; phone?: string };
      orders_requested?: number[];
    };
    const email = requestPayload.customer?.email;
    const phone = requestPayload.customer?.phone;
    const orderIds = (requestPayload.orders_requested ?? []).map((id) =>
      String(id),
    );

    const shopRecord = await prisma.shop.findUnique({
      where: { domain: shop },
      select: { id: true },
    });

    const conditions: Array<Record<string, unknown>> = [];
    if (email) conditions.push({ customerEmail: email });
    if (phone) conditions.push({ customerPhone: phone });
    if (orderIds.length > 0) conditions.push({ shopifyOrderId: { in: orderIds } });

    const shipments =
      shopRecord && conditions.length > 0
        ? await prisma.shipment.findMany({
            where: { shopId: shopRecord.id, OR: conditions },
            select: { id: true, shopifyOrderName: true, trackingNumber: true },
          })
        : [];

    console.warn(
      `[gdpr] customers/data_request shop=${shop} matched ${shipments.length} shipment(s): ${JSON.stringify(
        shipments,
      )} — export to the merchant within 30 days.`,
    );
    return;
  }

  if (normalizedTopic === "customers/redact") {
    if (!prisma) return;
    const redactPayload = payload as {
      customer?: { email?: string; phone?: string };
      orders_to_redact?: number[];
    };
    const customerEmail = redactPayload.customer?.email;
    const customerPhone = redactPayload.customer?.phone;
    const orderIds = (redactPayload.orders_to_redact ?? []).map(String);

    const conditions: Array<Record<string, unknown>> = [];
    if (customerEmail) conditions.push({ customerEmail });
    if (customerPhone) conditions.push({ customerPhone });
    if (orderIds.length > 0) conditions.push({ shopifyOrderId: { in: orderIds } });

    if (conditions.length === 0) return;

    const shopRecord = await prisma.shop.findUnique({
      where: { domain: shop },
      select: { id: true },
    });
    if (!shopRecord) return;

    // Find the affected shipments first so we can scrub every table that holds
    // their PII, not just the Shipment row (matches the privacy policy).
    const shipments = await prisma.shipment.findMany({
      where: { shopId: shopRecord.id, OR: conditions },
      select: { id: true },
    });
    const shipmentIds = shipments.map((entry) => entry.id);

    await prisma.$transaction([
      prisma.shipment.updateMany({
        where: { shopId: shopRecord.id, OR: conditions },
        data: { customerName: null, customerEmail: null, customerPhone: null },
      }),
      // NotificationLog.target holds the customer email; body/subject may echo
      // their name. Scrub them for the affected shipments.
      prisma.notificationLog.updateMany({
        where: { shopId: shopRecord.id, shipmentId: { in: shipmentIds } },
        data: { target: "[redacted]", subject: null, body: "[redacted]" },
      }),
      // StatusEvent.raw carries the provider payload for the shipment.
      prisma.statusEvent.updateMany({
        where: { shipmentId: { in: shipmentIds } },
        data: { raw: {}, message: null },
      }),
    ]);
    return;
  }

  if (normalizedTopic === "shop/redact") {
    if (prisma) {
      const shopRecord = await prisma.shop.findUnique({
        where: { domain: shop },
        select: { id: true },
      });
      if (shopRecord) {
        // Explicitly delete rows that are only SetNull-linked to Shop (they
        // would otherwise survive with full customer payloads), then cascade
        // the rest via onDelete: Cascade on the remaining Shop relations.
        await prisma.$transaction([
          prisma.queueJob.deleteMany({ where: { shopId: shopRecord.id } }),
          prisma.inboundWebhook.deleteMany({
            where: { OR: [{ shopId: shopRecord.id }, { shopDomain: shop }] },
          }),
          prisma.shop.delete({ where: { id: shopRecord.id } }),
        ]);
      } else {
        await prisma.inboundWebhook.deleteMany({ where: { shopDomain: shop } });
      }
    }
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }
    return;
  }

  if (
    normalizedTopic === "fulfillments/create" ||
    normalizedTopic === "fulfillments/update"
  ) {
    await ingestShopifyFulfillmentWebhook(shop, payload);
    return;
  }

  throw new Error(`Unsupported Shopify webhook topic: ${normalizedTopic || "unknown"}.`);
}

async function handleShopifyWebhook(request: Request) {
  const rawTopic = request.headers.get("x-shopify-topic") ?? "";
  const normalizedTopic = rawTopic.toLowerCase();
  const webhookId = request.headers.get("x-shopify-webhook-id");

  let payload: unknown;
  let session: ShopifyWebhookSession;
  let shop: string;

  try {
    const result = await authenticate.webhook(request);
    payload = result.payload;
    session = result.session;
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

  const idempotencyKey = webhookId ? `shopify:${webhookId}` : null;

  // Audit log: every authenticated Shopify webhook gets a row, including
  // GDPR/uninstall topics that previously had no record.
  let inbound: { id: string } | null = null;

  if (prisma && idempotencyKey) {
    const existing = await prisma.inboundWebhook.findUnique({
      where: { idempotencyKey },
      select: { id: true, status: true },
    });
    if (existing) {
      // Only short-circuit a delivery we already processed successfully. A row
      // left at FAILED/PENDING from a prior crash must be reprocessed on
      // Shopify's retry (same webhook id) rather than silently dropped.
      if (existing.status === ProcessingStatus.PROCESSED) {
        return new Response(null, { status: 200 });
      }
      inbound = { id: existing.id };
    }
  }

  if (prisma && !inbound) {
    // Attribute the audit row to the shop so per-shop health counts work.
    const shopRecord = await prisma.shop.findUnique({
      where: { domain: shop },
      select: { id: true },
    });

    try {
      const created = await prisma.inboundWebhook.create({
        data: {
          source: WebhookSource.SHOPIFY,
          topic: rawTopic || "unknown",
          shopId: shopRecord?.id ?? null,
          shopDomain: shop,
          idempotencyKey,
          headers: safeWebhookHeaders(request),
          payload: (payload ?? {}) as object,
        },
      });
      inbound = { id: created.id };
    } catch (error) {
      // Concurrent retry: another request created the row first.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002" &&
        idempotencyKey
      ) {
        const existing = await prisma.inboundWebhook.findUnique({
          where: { idempotencyKey },
          select: { id: true, status: true },
        });
        if (!existing || existing.status === ProcessingStatus.PROCESSED) {
          return new Response(null, { status: 200 });
        }
        inbound = { id: existing.id };
      } else {
        throw error;
      }
    }
  }

  try {
    await dispatchShopifyTopic(normalizedTopic, { shop, session, payload });

    if (prisma && inbound) {
      await prisma.inboundWebhook.update({
        where: { id: inbound.id },
        data: { status: ProcessingStatus.PROCESSED, processedAt: new Date() },
      });
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Webhook processing failed.";

    if (prisma && inbound) {
      await prisma.inboundWebhook.update({
        where: { id: inbound.id },
        data: { status: ProcessingStatus.FAILED, errorMessage },
      });
    }

    const status = errorMessage.startsWith("Unsupported Shopify webhook topic")
      ? 400
      : 500;
    return Response.json({ error: errorMessage }, { status });
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
