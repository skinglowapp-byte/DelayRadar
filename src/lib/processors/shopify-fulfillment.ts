import { JobType, TrackingProvider, type Prisma } from "@prisma/client";
import { z } from "zod";

import { enqueueJob } from "@/src/lib/jobs";
import { prisma } from "@/src/lib/prisma";
import { shopifyAdminGraphql } from "@/src/lib/shopify/admin";

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
  const firstName = payload.order?.customer?.first_name?.trim();
  const lastName = payload.order?.customer?.last_name?.trim();
  return [firstName, lastName].filter(Boolean).join(" ") || null;
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
        shopifyFulfillmentId: String(parsed.id),
        shopifyOrderId:
          parsed.order?.id || parsed.order_id
            ? String(parsed.order?.id ?? parsed.order_id)
            : null,
        shopifyOrderName: parsed.order?.name ?? parsed.name ?? null,
        trackingCarrier: parsed.tracking_company ?? undefined,
        customerEmail: parsed.order?.email ?? undefined,
        customerPhone: parsed.order?.phone ?? undefined,
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
        shopifyFulfillmentId: String(parsed.id),
        shopifyOrderId:
          parsed.order?.id || parsed.order_id
            ? String(parsed.order?.id ?? parsed.order_id)
            : null,
        shopifyOrderName: parsed.order?.name ?? parsed.name ?? null,
        trackingNumber,
        trackingCarrier: parsed.tracking_company ?? null,
        trackingProvider: TrackingProvider.EASYPOST,
        customerEmail: parsed.order?.email ?? null,
        customerPhone: parsed.order?.phone ?? null,
        customerName: getCustomerName(parsed),
        orderCreatedAt: parsed.order?.created_at
          ? new Date(parsed.order.created_at)
          : null,
        orderValueCents: parseMoneyToCents(parsed.order?.total_price),
        orderTags: parsed.order?.tags?.trim() || null,
        shippingMethodLabel: getShippingMethodLabel(parsed),
      },
    });

    await enqueueJob({
      shopId: shop.id,
      shipmentId: shipment.id,
      type: JobType.CREATE_TRACKER,
      payload: {
        shipmentId: shipment.id,
        trackingNumber,
        carrier: parsed.tracking_company ?? "",
      } satisfies Prisma.InputJsonObject,
    });
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

  const data = await shopifyAdminGraphql<BackfillOrdersResponse>({
    shop: shop.domain,
    accessToken: shop.offlineAccessToken,
    query: `#graphql
      query DelayRadarBackfillOrders {
        orders(first: 25, reverse: true, sortKey: CREATED_AT, query: "fulfillment_status:fulfilled OR fulfillment_status:partial") {
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
    `,
  });

  let ingested = 0;

  for (const edge of data.orders.edges) {
    if (!shop.currencyCode && edge.node.currentTotalPriceSet?.shopMoney.currencyCode) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: {
          currencyCode: edge.node.currentTotalPriceSet.shopMoney.currencyCode,
        },
      });
      shop.currencyCode = edge.node.currentTotalPriceSet.shopMoney.currencyCode;
    }

    for (const fulfillment of edge.node.fulfillments) {
      for (const trackingInfo of fulfillment.trackingInfo) {
        if (!trackingInfo.number) {
          continue;
        }

        await prisma.shipment.upsert({
          where: {
            shopId_trackingNumber: {
              shopId: shop.id,
              trackingNumber: trackingInfo.number,
            },
          },
          update: {
            shopifyOrderId: edge.node.id,
            shopifyOrderName: edge.node.name,
            shopifyFulfillmentId: fulfillment.id,
            trackingCarrier: trackingInfo.company ?? undefined,
            customerName:
              [
                edge.node.customer?.firstName,
                edge.node.customer?.lastName,
              ]
                .filter(Boolean)
                .join(" ") || undefined,
            customerEmail: edge.node.customer?.email ?? undefined,
            customerPhone: edge.node.customer?.phone ?? undefined,
            orderCreatedAt: new Date(edge.node.createdAt),
            orderValueCents: parseMoneyToCents(
              edge.node.currentTotalPriceSet?.shopMoney.amount,
            ) ?? undefined,
            orderTags: edge.node.tags.join(", ") || undefined,
            shippingMethodLabel:
              edge.node.shippingLines.edges
                .map((shippingLine) => shippingLine.node.title?.trim())
                .find(Boolean) ?? undefined,
          },
          create: {
            shopId: shop.id,
            shopifyOrderId: edge.node.id,
            shopifyOrderName: edge.node.name,
            shopifyFulfillmentId: fulfillment.id,
            trackingNumber: trackingInfo.number,
            trackingCarrier: trackingInfo.company,
            trackingProvider: TrackingProvider.EASYPOST,
            customerName:
              [
                edge.node.customer?.firstName,
                edge.node.customer?.lastName,
              ]
                .filter(Boolean)
                .join(" ") || null,
            customerEmail: edge.node.customer?.email ?? null,
            customerPhone: edge.node.customer?.phone ?? null,
            orderCreatedAt: new Date(edge.node.createdAt),
            orderValueCents: parseMoneyToCents(
              edge.node.currentTotalPriceSet?.shopMoney.amount,
            ),
            orderTags: edge.node.tags.join(", ") || null,
            shippingMethodLabel:
              edge.node.shippingLines.edges
                .map((shippingLine) => shippingLine.node.title?.trim())
                .find(Boolean) ?? null,
          },
        });

        ingested += 1;
      }
    }
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      lastSyncedAt: new Date(),
    },
  });

  return { ingested };
}
