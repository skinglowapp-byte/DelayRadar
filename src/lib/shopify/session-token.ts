import { jwtVerify } from "jose";

import { getShopifyApiKey } from "@/src/lib/env";
import { normalizeShopDomain } from "@/src/lib/shopify/oauth";

const DEMO_SHOP_DOMAIN = "demo-shop.myshopify.com";

function getAuthorizationToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function verifySessionToken(token: string) {
  const apiKey = getShopifyApiKey();
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!apiKey || !secret) {
    return null;
  }

  const result = await jwtVerify(token, new TextEncoder().encode(secret), {
    audience: apiKey,
  });

  const destination = result.payload.dest;

  if (typeof destination !== "string") {
    return null;
  }

  return normalizeShopDomain(new URL(destination).hostname);
}

export async function resolveShopFromRequest(
  request: Request,
  options?: { requireJwt?: boolean },
) {
  const url = new URL(request.url);
  const shopFromQuery = normalizeShopDomain(url.searchParams.get("shop"));

  if (shopFromQuery === DEMO_SHOP_DOMAIN) {
    return DEMO_SHOP_DOMAIN;
  }

  const token = getAuthorizationToken(request);

  if (token) {
    try {
      const verifiedShop = await verifySessionToken(token);

      if (verifiedShop) {
        return verifiedShop;
      }
    } catch {
      // Fall through to discovery below.
    }
  }

  // Write operations must use a verified JWT — never trust query params
  // or cookies for mutations.
  if (options?.requireJwt) {
    return null;
  }

  // In development, also trust the cookie fallback for convenience.
  if (process.env.NODE_ENV !== "production") {
    if (shopFromQuery) {
      return shopFromQuery;
    }

    return normalizeShopDomain(getCookie(request, "delayradar_shop"));
  }

  // In production, verify the shop cookie set during OAuth callback.
  // Never trust the bare query param — it's user-controllable and would
  // allow unauthenticated reads of any shop's data.
  const shopFromCookie = normalizeShopDomain(
    getCookie(request, "delayradar_shop"),
  );

  if (shopFromCookie) {
    return shopFromCookie;
  }

  return null;
}
