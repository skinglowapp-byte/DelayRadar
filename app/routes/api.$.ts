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

async function handleShopifyWebhook(request: Request) {
  const rawTopic = request.headers.get("x-shopify-topic") ?? "";
  const normalizedTopic = rawTopic.toLowerCase();

  let payload: unknown;
  let session: Awaited<ReturnType<typeof authenticate.webhook>>["session"];
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

    return new Response();
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

    return new Response();
  }

  if (normalizedTopic === "customers/data_request") {
    // Acknowledge the data request. DelayRadar stores minimal customer PII
    // (email, phone, name) on Shipment records keyed by shop, not by a
    // Shopify customer ID. The merchant can export shipment data on request.
    return new Response(null, { status: 200 });
  }

  if (normalizedTopic === "customers/redact") {
    // GDPR: scrub customer PII from all shipments belonging to this shop
    // that match the customer's email or phone from the redact payload.
    if (prisma) {
      const redactPayload = payload as {
        customer?: { email?: string; phone?: string };
        orders_to_redact?: number[];
      };
      const customerEmail = redactPayload.customer?.email;
      const customerPhone = redactPayload.customer?.phone;
      const orderIds = (redactPayload.orders_to_redact ?? []).map(String);

      const conditions: Array<Record<string, unknown>> = [];
      if (customerEmail) {
        conditions.push({ customerEmail });
      }
      if (customerPhone) {
        conditions.push({ customerPhone });
      }
      if (orderIds.length > 0) {
        conditions.push({ shopifyOrderId: { in: orderIds } });
      }

      if (conditions.length > 0) {
        const shopRecord = await prisma.shop.findUnique({
          where: { domain: shop },
          select: { id: true },
        });

        if (shopRecord) {
          await prisma.shipment.updateMany({
            where: {
              shopId: shopRecord.id,
              OR: conditions,
            },
            data: {
              customerName: null,
              customerEmail: null,
              customerPhone: null,
            },
          });
        }
      }
    }

    return new Response(null, { status: 200 });
  }

  if (normalizedTopic === "shop/redact") {
    // GDPR: delete ALL data associated with this shop within 48 hours.
    if (prisma) {
      const shopRecord = await prisma.shop.findUnique({
        where: { domain: shop },
        select: { id: true },
      });

      if (shopRecord) {
        // Cascade-delete all shop data. The Prisma schema uses onDelete:
        // Cascade on most relations, so deleting the Shop record removes
        // shipments, templates, rules, notifications, notes, and jobs.
        await prisma.shop.delete({ where: { id: shopRecord.id } });
      }
    }

    // Also clean up any Shopify sessions for this shop domain.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    return new Response(null, { status: 200 });
  }

  if (
    normalizedTopic !== "fulfillments/create" &&
    normalizedTopic !== "fulfillments/update"
  ) {
    return Response.json(
      { error: `Unsupported Shopify webhook topic: ${rawTopic || "unknown"}.` },
      { status: 400 },
    );
  }

  const webhookId = request.headers.get("x-shopify-webhook-id");

  if (!webhookId) {
    return Response.json(
      { error: "Missing x-shopify-webhook-id header." },
      { status: 400 },
    );
  }

  const idempotencyKey = `shopify:${webhookId}`;

  if (prisma) {
    const duplicate = await prisma.inboundWebhook.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });

    if (duplicate) {
      return new Response(null, { status: 200 });
    }
  }

  const inbound = prisma
    ? await prisma.inboundWebhook.create({
        data: {
          source: WebhookSource.SHOPIFY,
          topic: rawTopic || "unknown",
          shopDomain: shop,
          idempotencyKey,
          headers: Object.fromEntries(request.headers.entries()),
          payload: payload as object,
        },
      })
    : null;

  try {
    await ingestShopifyFulfillmentWebhook(shop, payload);

    if (prisma && inbound) {
      await prisma.inboundWebhook.update({
        where: { id: inbound.id },
        data: {
          status: ProcessingStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    if (prisma && inbound) {
      await prisma.inboundWebhook.update({
        where: { id: inbound.id },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : "Webhook processing failed.",
        },
      });
    }

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Webhook processing failed.",
      },
      { status: 500 },
    );
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
