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
  const { payload, session, shop } = await authenticate.webhook(request);

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

export async function loader({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;

  if (
    pathname === "/api/auth/start" ||
    pathname === "/api/auth/callback"
  ) {
    return handleLegacyAuthRoute(request);
  }

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

  const handler = postRoutes[pathname];

  if (!handler) {
    return new Response("Not Found", { status: 404 });
  }

  return handler(request);
}
