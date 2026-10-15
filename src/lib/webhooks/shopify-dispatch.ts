import { prisma } from "@/src/lib/prisma";
import { ingestShopifyFulfillmentWebhook } from "@/src/lib/processors/shopify-fulfillment";
import { syncShopPlan } from "@/src/lib/shopify/subscription";

export const SUPPORTED_SHOPIFY_TOPICS = new Set([
  "app/uninstalled",
  "app_subscriptions/update",
  "app/scopes_update",
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "fulfillments/create",
  "fulfillments/update",
]);

// Runs the work for one verified Shopify webhook. Called after the delivery
// has already been acknowledged (see handleShopifyWebhook), and again by the
// worker for deliveries whose first attempt failed, so it must be safe to
// re-run for the same payload.
export async function dispatchShopifyTopic(
  normalizedTopic: string,
  ctx: {
    shop: string;
    payload: unknown;
  },
) {
  const { shop, payload } = ctx;

  if (normalizedTopic === "app/uninstalled") {
    if (prisma) {
      await prisma.session.deleteMany({ where: { shop } });
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

  // Fires when a merchant picks, changes or cancels a plan on Shopify's plan
  // page. Re-reading the plan here means an upgrade unlocks immediately,
  // instead of waiting for the next dashboard open or worker run.
  if (normalizedTopic === "app_subscriptions/update") {
    if (prisma) {
      const record = await prisma.shop.findUnique({
        where: { domain: shop },
        select: { id: true },
      });
      if (record) {
        await syncShopPlan(record.id);
      }
    }
    return;
  }

  if (normalizedTopic === "app/scopes_update") {
    const currentScopes = Array.isArray((payload as { current?: unknown }).current)
      ? ((payload as { current: string[] }).current ?? []).join(",")
      : "";

    if (prisma) {
      await prisma.session.updateMany({
        where: { shop },
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
    // fulfil the request. ReturnSense has no automated export channel, so we
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
    if (prisma) {
      await prisma.session.deleteMany({ where: { shop } });
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
