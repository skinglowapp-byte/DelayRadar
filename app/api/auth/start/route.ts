import { NextResponse } from "@/src/lib/next-response";

import { getShopifyApiKey } from "@/src/lib/env";
import {
  buildInstallUrl,
  createOAuthState,
  normalizeShopDomain,
} from "@/src/lib/shopify/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shop = normalizeShopDomain(url.searchParams.get("shop"));

  if (!shop) {
    return NextResponse.json(
      { error: "Enter a valid .myshopify.com domain." },
      { status: 400 },
    );
  }

  if (
    !getShopifyApiKey() ||
    !process.env.SHOPIFY_API_SECRET
  ) {
    return NextResponse.json(
      { error: "Shopify app credentials are missing from the environment." },
      { status: 500 },
    );
  }

  const state = createOAuthState();
  const response = NextResponse.redirect(buildInstallUrl(shop, state));

  response.cookies.set("delayradar_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return response;
}
