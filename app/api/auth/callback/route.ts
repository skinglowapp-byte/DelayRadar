import { JobType, type Prisma } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";

import { ensureDefaultAutomation } from "@/src/lib/data/defaults";
import { getAppUrl, getShopifyApiKey } from "@/src/lib/env";
import { enqueueJob } from "@/src/lib/jobs";
import {
  exchangeCodeForOfflineToken,
  normalizeShopDomain,
  upsertInstalledShop,
  verifyOAuthHmac,
} from "@/src/lib/shopify/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const host = url.searchParams.get("host");
  const cookieState =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("delayradar_oauth_state="))
      ?.split("=").slice(1).join("=") ?? null;

  if (!shop || !code || !state) {
    return NextResponse.json(
      { error: "Missing required Shopify OAuth parameters." },
      { status: 400 },
    );
  }

  if (!verifyOAuthHmac(url.searchParams)) {
    return NextResponse.json(
      { error: "Shopify OAuth HMAC verification failed." },
      { status: 400 },
    );
  }

  if (!cookieState || cookieState !== state) {
    return NextResponse.json(
      { error: "Shopify OAuth state mismatch." },
      { status: 400 },
    );
  }

  try {
    const tokenResponse = await exchangeCodeForOfflineToken(shop, code);
    const installedShop = await upsertInstalledShop({
      shop,
      accessToken: tokenResponse.access_token,
      scope: tokenResponse.scope,
    });

    await ensureDefaultAutomation(installedShop.id);
    await enqueueJob({
      shopId: installedShop.id,
      type: JobType.BACKFILL_SHIPMENTS,
      payload: {
        shopId: installedShop.id,
      } satisfies Prisma.InputJsonObject,
    });

    // Redirect back into the Shopify admin so the app stays embedded
    // in the iframe instead of navigating to the raw Vercel URL.
    const apiKey = getShopifyApiKey();
    const redirectUrl = host
      ? new URL(
          `https://${shop}/admin/apps/${apiKey}`,
        )
      : new URL("/app", getAppUrl());

    redirectUrl.searchParams.set("shop", shop);
    if (host) {
      redirectUrl.searchParams.set("host", host);
    }

    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set("delayradar_shop", shop, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set("delayradar_oauth_state", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Shopify install failed.",
      },
      { status: 500 },
    );
  }
}
