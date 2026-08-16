import {
  JobStatus,
  JobType,
  TrackingProvider,
  type Prisma,
  type Shipment,
} from "@prisma/client";
import { z } from "zod";

import { decrypt } from "@/src/lib/crypto";
import { enqueueJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import { shopifyAdminGraphql } from "@/src/lib/shopify/admin";

// Shopify webhooks send bare numeric IDs while the Admin GraphQL API sends
// GIDs (gid://shopify/Order/123). Normalize both to the numeric string so the
// two ingest paths write the same value and GDPR redaction / dedupe match.
export function toNumericId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const match = String(value).match(/(\d+)\s*$/);
  return match ? match[1] : String(value);
}

// Enqueue a CREATE_TRACKER job for a shipment that doesn't yet have an
// EasyPost tracker, skipping shipments that already have one and de-duping
// against any pending/processing tracker job. This is what makes backfilled
// shipments actually monitored, and prevents fulfillments/create +
// fulfillments/update from creating two billable trackers for one shipment.
async function enqueueTrackerCreation(
  shopId: string,
  shipment: Shipment,
  trackingNumber: string,
  carrier: string | null | undefined,
) {
  if (!prisma || shipment.trackingProviderId) {
    return;
  }

  const existing = await prisma.queueJob.findFirst({
    where: {
      shipmentId: shipment.id,
      type: JobType.CREATE_TRACKER,
      status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await enqueueJob({
    shopId,
    shipmentId: shipment.id,
    type: JobType.CREATE_TRACKER,
    payload: {
      shipmentId: shipment.id,
      trackingNumber,
      carrier: carrier ?? "",
    } satisfies Prisma.InputJsonObject,
  });
}

const fulfillmentWebhookSchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  order_id: z.number().nullish(),
  tracking_company: z.string().nullish(),
  tracking_number: z.string().nullish(),
  tracking_numbers: z.array(z.string()).optional(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  shipment_status: z.string().nullish(),
  // The real fulfillments/create|update payload carries the customer contact
  // at the top level (there is no nested `order`). Capture both.
  email: z.string().nullish(),
  destination: z
    .object({
      first_name: z.string().nullish(),
      last_name: z.string().nullish(),
      phone: z.string().nullish(),
    })
    .nullish(),
  order: z
    .object({
      id: z.number().nullish(),
      name: z.string().nullish(),
      created_at: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
      total_price: z.union([z.string(), z.number()]).nullish(),
      tags: z.string().nullish(),
      shipping_lines: z
        .array(
          z.object({
            title: z.string().nullish(),
          }),
        )
        .nullish(),
      customer: z
        .object({
          first_name: z.string().nullish(),
          last_name: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

type FulfillmentWebhookPayload = z.infer<typeof fulfillmentWebhookSchema>;

function getTrackingNumbers(payload: FulfillmentWebhookPayload) {
  return Array.from(
    new Set(
      [...(payload.tracking_numbers ?? []), payload.tracking_number]
        .filter(Boolean)
        .map((entry) => entry!.trim()),
    ),
  );
}

function getCustomerName(payload: FulfillmentWebhookPayload) {
  const firstName =
    payload.order?.customer?.first_name?.trim() ??
    payload.destination?.first_name?.trim();
  const lastName =
    payload.order?.customer?.last_name?.trim() ??
    payload.destination?.last_name?.trim();
  return [firstName, lastName].filter(Boolean).join(" ") || null;
}

function getCustomerEmail(payload: FulfillmentWebhookPayload) {
  return payload.order?.email ?? payload.email ?? null;
}

function getCustomerPhone(payload: FulfillmentWebhookPayload) {
  return payload.order?.phone ?? payload.destination?.phone ?? null;
}

function parseMoneyToCents(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
}

function getShippingMethodLabel(payload: FulfillmentWebhookPayload) {
  return (
    payload.order?.shipping_lines?.find((entry) => entry.title?.trim())?.title?.trim() ??
    null
  );
}

export async function ingestShopifyFulfillmentWebhook(
  shopDomain: string,
  payload: unknown,
) {
  if (!prisma) {
    return { ingested: 0 };
  }

  const parsed = fulfillmentWebhookSchema.parse(payload);
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });

  if (!shop) {
    throw new Error(`No installed shop found for ${shopDomain}`);
  }

  const trackingNumbers = getTrackingNumbers(parsed);

  for (const trackingNumber of trackingNumbers) {
    const shipment = await prisma.shipment.upsert({
      where: {
        shopId_trackingNumber: {
          shopId: shop.id,
          trackingNumber,
        },
      },
      update: {
        shopifyFulfillmentId: toNumericId(parsed.id),
        shopifyOrderId: toNumericId(parsed.order?.id ?? parsed.order_id),
        shopifyOrderName: parsed.order?.name ?? parsed.name ?? null,
        trackingCarrier: parsed.tracking_company ?? undefined,
        customerEmail: getCustomerEmail(parsed) ?? undefined,
        customerPhone: getCustomerPhone(parsed) ?? undefined,
        customerName: getCustomerName(parsed) ?? undefined,
        orderCreatedAt: parsed.order?.created_at
          ? new Date(parsed.order.created_at)
          : undefined,
        orderValueCents: parseMoneyToCents(parsed.order?.total_price) ?? undefined,
        orderTags: parsed.order?.tags?.trim() || undefined,
        shippingMethodLabel: getShippingMethodLabel(parsed) ?? undefined,
      },
      create: {
        shopId: shop.id,
        shopifyFulfillmentId: toNumericId(parsed.id),
        shopifyOrderId: toNumericId(parsed.order?.id ?? parsed.order_id),
        shopifyOrderName: parsed.order?.name ?? parsed.name ?? null,
        trackingNumber,
        trackingCarrier: parsed.tracking_company ?? null,
        trackingProvider: TrackingProvider.EASYPOST,
        customerEmail: getCustomerEmail(parsed),
        customerPhone: getCustomerPhone(parsed),
        customerName: getCustomerName(parsed),
        orderCreatedAt: parsed.order?.created_at
          ? new Date(parsed.order.created_at)
          : null,
        orderValueCents: parseMoneyToCents(parsed.order?.total_price),
        orderTags: parsed.order?.tags?.trim() || null,
        shippingMethodLabel: getShippingMethodLabel(parsed),
      },
    });

    await enqueueTrackerCreation(
      shop.id,
      shipment,
      trackingNumber,
      parsed.tracking_company,
    );
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      lastSyncedAt: new Date(),
    },
  });

  return { ingested: trackingNumbers.length };
}

type BackfillOrdersResponse = {
  orders: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    edges: Array<{
      node: {
        id: string;
        name: string;
        createdAt: string;
        tags: string[];
        currentTotalPriceSet: {
          shopMoney: {
            amount: string;
            currencyCode: string;
          };
        } | null;
        shippingLines: {
          edges: Array<{
            node: {
              title: string | null;
            };
          }>;
        };
        customer: {
          firstName: string | null;
          lastName: string | null;
          email: string | null;
          phone: string | null;
        } | null;
        fulfillments: Array<{
          id: string;
          trackingInfo: Array<{
            company: string | null;
            number: string | null;
            url: string | null;
          }>;
        }>;
      };
    }>;
  };
};

export async function backfillRecentShipments(shopId: string) {
  if (!prisma) {
    return { ingested: 0 };
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop?.offlineAccessToken) {
    throw new Error("Shop is missing an offline access token.");
  }

  const accessToken = decrypt(shop.offlineAccessToken);

  const query = `#graphql
      query DelayRadarBackfillOrders($cursor: String) {
        orders(first: 50, after: $cursor, reverse: true, sortKey: CREATED_AT, query: "fulfillment_status:fulfilled OR fulfillment_status:partial") {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              name
              createdAt
              tags
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              shippingLines(first: 5) {
                edges {
                  node {
                    title
                  }
                }
              }
              customer {
                firstName
                lastName
                email
                phone
              }
              fulfillments(first: 10) {
                id
                trackingInfo(first: 10) {
                  company
                  number
                  url
                }
              }
            }
          }
        }
      }
    `;

  let ingested = 0;
  let cursor: string | null = null;
  let pages = 0;
  // Cap pages per invocation so one huge store can't run the function past its
  // timeout. 20 pages × 50 orders = 1,000 orders per sync; the next sync
  // resumes newer orders (reverse chronological) and re-upserts idempotently.
  const MAX_PAGES = 20;

  do {
    const data: BackfillOrdersResponse =
      await shopifyAdminGraphql<BackfillOrdersResponse>({
        shop: shop.domain,
        accessToken,
        query,
        variables: { cursor },
      });

    for (const edge of data.orders.edges) {
      if (
        !shop.currencyCode &&
        edge.node.currentTotalPriceSet?.shopMoney.currencyCode
      ) {
        await prisma.shop.update({
          where: { id: shop.id },
          data: {
            currencyCode: edge.node.currentTotalPriceSet.shopMoney.currencyCode,
          },
        });
        shop.currencyCode = edge.node.currentTotalPriceSet.shopMoney.currencyCode;
      }

      const trackedNumbers = edge.node.fulfillments.flatMap((fulfillment) =>
        fulfillment.trackingInfo
          .filter((trackingInfo) => trackingInfo.number)
          .map((trackingInfo) => ({ fulfillment, trackingInfo })),
      );

      const customerName =
        [edge.node.customer?.firstName, edge.node.customer?.lastName]
          .filter(Boolean)
          .join(" ") || null;
      const shippingMethodLabel =
        edge.node.shippingLines.edges
          .map((shippingLine) => shippingLine.node.title?.trim())
          .find(Boolean) ?? null;

      for (const { fulfillment, trackingInfo } of trackedNumbers) {
        const shipment = await prisma.shipment.upsert({
          where: {
            shopId_trackingNumber: {
              shopId: shop.id,
              trackingNumber: trackingInfo.number!,
            },
          },
          update: {
            shopifyOrderId: toNumericId(edge.node.id),
            shopifyOrderName: edge.node.name,
            shopifyFulfillmentId: toNumericId(fulfillment.id),
            trackingCarrier: trackingInfo.company ?? undefined,
            customerName: customerName ?? undefined,
            customerEmail: edge.node.customer?.email ?? undefined,
            customerPhone: edge.node.customer?.phone ?? undefined,
            orderCreatedAt: new Date(edge.node.createdAt),
            orderValueCents:
              parseMoneyToCents(
                edge.node.currentTotalPriceSet?.shopMoney.amount,
              ) ?? undefined,
            orderTags: edge.node.tags.join(", ") || undefined,
            shippingMethodLabel: shippingMethodLabel ?? undefined,
          },
          create: {
            shopId: shop.id,
            shopifyOrderId: toNumericId(edge.node.id),
            shopifyOrderName: edge.node.name,
            shopifyFulfillmentId: toNumericId(fulfillment.id),
            trackingNumber: trackingInfo.number!,
            trackingCarrier: trackingInfo.company,
            trackingProvider: TrackingProvider.EASYPOST,
            customerName,
            customerEmail: edge.node.customer?.email ?? null,
            customerPhone: edge.node.customer?.phone ?? null,
            orderCreatedAt: new Date(edge.node.createdAt),
            orderValueCents: parseMoneyToCents(
              edge.node.currentTotalPriceSet?.shopMoney.amount,
            ),
            orderTags: edge.node.tags.join(", ") || null,
            shippingMethodLabel,
          },
        });

        // Backfilled shipments must get an EasyPost tracker too — otherwise no
        // carrier events ever arrive and nothing is monitored.
        await enqueueTrackerCreation(
          shop.id,
          shipment,
          trackingInfo.number!,
          trackingInfo.company,
        );

        ingested += 1;
      }
    }

    cursor = data.orders.pageInfo.hasNextPage
      ? data.orders.pageInfo.endCursor
      : null;
    pages += 1;
  } while (cursor && pages < MAX_PAGES);

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      lastSyncedAt: new Date(),
    },
  });

  return { ingested };
}
