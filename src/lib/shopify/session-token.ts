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
  // or cookies for mutations. This gate runs before any unauthenticated
  // fallback (including the demo shop) so mutations can never bypass auth.
  if (options?.requireJwt) {
    return null;
  }

  const url = new URL(request.url);
  const shopFromQuery = normalizeShopDomain(url.searchParams.get("shop"));

  // The read-only demo shop is a public preview backed by mock data. It is
  // only ever resolvable on non-JWT read paths, never for mutations.
  if (shopFromQuery === DEMO_SHOP_DOMAIN) {
    return DEMO_SHOP_DOMAIN;
  }

  // In development, trust the query param for local convenience only.
  if (process.env.NODE_ENV !== "production") {
    return shopFromQuery;
  }

  // In production there is no unauthenticated read fallback: a real shop must
  // present a verified App Bridge session token. (The old `delayradar_shop`
  // cookie fallback was forgeable and its writer was removed — never restore
  // it without an HMAC-signed, server-set cookie.)
  return null;
}
