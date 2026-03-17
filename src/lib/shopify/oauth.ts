import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { encrypt } from "@/src/lib/crypto";
import { getAppUrl, getShopifyApiKey, getShopifyScopes } from "@/src/lib/env";
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

export function createOAuthState() {
  return randomUUID();
}

export function buildInstallUrl(shop: string, state: string) {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", getShopifyApiKey());
  url.searchParams.set("scope", getShopifyScopes());
  url.searchParams.set("redirect_uri", `${getAppUrl()}/api/auth/callback`);
  url.searchParams.set("state", state);

  return url.toString();
}

export function verifyOAuthHmac(searchParams: URLSearchParams) {
  const hmac = searchParams.get("hmac");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!hmac || !secret) {
    return false;
  }

  const message = Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  const digest = createHmac("sha256", secret).update(message).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch {
    return false;
  }
}

export async function exchangeCodeForOfflineToken(shop: string, code: string) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: getShopifyApiKey(),
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange failed with ${response.status}`);
  }

  return (await response.json()) as {
    access_token: string;
    scope: string;
  };
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
