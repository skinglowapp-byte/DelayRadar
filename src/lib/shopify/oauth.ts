import { encrypt } from "@/src/lib/crypto";
import { prisma } from "@/src/lib/prisma";
import { shopifyAdminGraphql } from "@/src/lib/shopify/admin";

export function normalizeShopDomain(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const cleaned = input.trim().toLowerCase().replace(/^https?:\/\//, "");

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

export async function fetchShopMetadata(shop: string, accessToken: string) {
  const data = await shopifyAdminGraphql<{
    shop: {
      name: string;
      email: string;
      ianaTimezone: string;
      currencyCode: string;
    };
  }>({
    shop,
    accessToken,
    query: `#graphql
      query ShopIdentity {
        shop {
          name
          email
          ianaTimezone
          currencyCode
        }
      }
    `,
  });

  return data.shop;
}

export async function upsertInstalledShop(input: {
  shop: string;
  accessToken: string;
  scope: string;
}) {
  if (!prisma) {
    throw new Error("DATABASE_URL is required to install the app.");
  }

  const metadata = await fetchShopMetadata(input.shop, input.accessToken);

  const encryptedToken = encrypt(input.accessToken);

  return prisma.shop.upsert({
    where: { domain: input.shop },
    update: {
      shopName: metadata.name,
      email: metadata.email,
      timezone: metadata.ianaTimezone,
      currencyCode: metadata.currencyCode,
      offlineAccessToken: encryptedToken,
      scopes: input.scope,
      isInstalled: true,
      installedAt: new Date(),
      uninstalledAt: null,
    },
    create: {
      domain: input.shop,
      shopName: metadata.name,
      email: metadata.email,
      timezone: metadata.ianaTimezone,
      currencyCode: metadata.currencyCode,
      offlineAccessToken: encryptedToken,
      scopes: input.scope,
      isInstalled: true,
      installedAt: new Date(),
    },
  });
}
