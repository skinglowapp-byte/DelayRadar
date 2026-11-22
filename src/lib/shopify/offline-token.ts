import { assertEncryptionKey, decrypt, encrypt } from "@/src/lib/crypto";
import { prisma } from "@/src/lib/prisma";

import { ShopifyTokenRevokedError } from "./admin";

// The app opts into Shopify's expiring offline access tokens
// (`future.expiringOfflineAccessTokens` in app/shopify.server.ts). An offline
// token then lives about an hour, and the Session row also holds a refresh
// token (valid ~90 days) that buys a new pair. Background work — the worker,
// backfills, plan syncs — has no merchant request to piggyback on, so it has to
// refresh the token itself. Before this helper existed nothing did, and every
// install stopped working one hour after it was made.
//
// The Session row (written by PrismaSessionStorage) is the source of truth.
// Shop.offlineAccessToken is kept as an encrypted copy because several queries
// and the setup checklist use it as an "authorised" flag.

// Same margin the Shopify library uses before it treats a token as expired.
const REFRESH_MARGIN_MS = 5 * 60_000;

// Covers the advisory-lock wait plus one HTTP round trip to Shopify.
const REFRESH_TRANSACTION_TIMEOUT_MS = 20_000;

type OfflineSessionRow = {
  accessToken: string;
  expires: Date | null;
  refreshToken: string | null;
  refreshTokenExpires: Date | null;
};

type RefreshedToken = {
  accessToken: string;
  scope: string | null;
  expires: Date | null;
  refreshToken: string | null;
  refreshTokenExpires: Date | null;
};

export function offlineSessionId(shop: string) {
  return `offline_${shop}`;
}

function needsRefresh(session: OfflineSessionRow, now = Date.now()) {
  return Boolean(
    session.expires && session.expires.getTime() - now <= REFRESH_MARGIN_MS,
  );
}

// Raised when a refresh fails in a way a retry could fix (a Shopify 5xx, a
// network error, an unexpected 4xx). Deliberately NOT a
// ShopifyTokenRevokedError: revoking clears the token and retires the shop,
// so it is reserved for failures that are known to be permanent.
export class ShopifyTokenRefreshError extends Error {
  constructor(shop: string, detail: string) {
    super(`Could not refresh the Shopify access token for ${shop}: ${detail}`);
    this.name = "ShopifyTokenRefreshError";
  }
}

async function requestTokenRefresh(
  shop: string,
  refreshToken: string,
): Promise<RefreshedToken> {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new ShopifyTokenRefreshError(
      shop,
      "SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set.",
    );
  }

  // Mirrors @shopify/shopify-api's auth.refreshToken (lib/auth/oauth/refresh-token.js).
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    // The only refresh failure the Shopify library itself treats as permanent.
    if (response.status === 400 && body.error === "invalid_subject_token") {
      throw new ShopifyTokenRevokedError(shop);
    }
    throw new ShopifyTokenRefreshError(
      shop,
      `HTTP ${response.status} ${text.slice(0, 300)}`,
    );
  }

  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new ShopifyTokenRefreshError(shop, "response had no access_token");
  }

  const inSeconds = (value: unknown) =>
    typeof value === "number" && value > 0
      ? new Date(Date.now() + value * 1000)
      : null;

  return {
    accessToken,
    scope: typeof body.scope === "string" ? body.scope : null,
    expires: inSeconds(body.expires_in),
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : null,
    refreshTokenExpires: inSeconds(body.refresh_token_expires_in),
  };
}

// Refreshes under a per-shop Postgres advisory lock, so concurrent worker jobs
// (runJobBatch runs them in parallel) and overlapping cron invocations don't
// each spend the same refresh token. The embedded app's own refresh path in
// @shopify/shopify-app-react-router does not take this lock, which is why a
// failed refresh re-reads the row before deciding anything.
async function refreshUnderLock(
  shop: string,
  staleToken: string | undefined,
): Promise<string> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required to refresh Shopify tokens.");
  }

  // Fail before spending the refresh token, not after: once Shopify answers,
  // the old refresh token may already be dead.
  assertEncryptionKey();

  const db = prisma;
  const sessionId = offlineSessionId(shop);

  const refreshed = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`offline-token:${shop}`}))`;

      const session = await tx.session.findUnique({ where: { id: sessionId } });

      if (!session) {
        throw new ShopifyTokenRevokedError(shop);
      }

      // Someone refreshed while we waited for the lock.
      if (staleToken ? session.accessToken !== staleToken : !needsRefresh(session)) {
        return { accessToken: session.accessToken, changed: false as const };
      }

      if (!session.refreshToken) {
        // A non-expiring token, or one stored before refresh tokens existed:
        // there is nothing to refresh with.
        return { accessToken: session.accessToken, changed: false as const };
      }

      if (
        session.refreshTokenExpires &&
        session.refreshTokenExpires.getTime() <= Date.now()
      ) {
        throw new ShopifyTokenRevokedError(shop);
      }

      const fresh = await requestTokenRefresh(shop, session.refreshToken);

      // First statement after the fetch: this row is the only place the new
      // refresh token lives.
      await tx.session.update({
        where: { id: sessionId },
        data: {
          accessToken: fresh.accessToken,
          expires: fresh.expires,
          // Keep the old refresh token if Shopify didn't return a new one.
          ...(fresh.refreshToken
            ? {
                refreshToken: fresh.refreshToken,
                refreshTokenExpires: fresh.refreshTokenExpires,
              }
            : {}),
          ...(fresh.scope ? { scope: fresh.scope } : {}),
        },
      });

      return { accessToken: fresh.accessToken, changed: true as const };
    },
    {
      maxWait: REFRESH_TRANSACTION_TIMEOUT_MS,
      timeout: REFRESH_TRANSACTION_TIMEOUT_MS,
    },
  );

  if (refreshed.changed) {
    // Outside the transaction on purpose: a failure here must not roll back
    // the Session write that holds the rotated refresh token.
    try {
      await db.shop.updateMany({
        where: { domain: shop },
        data: { offlineAccessToken: encrypt(refreshed.accessToken) },
      });
    } catch (error) {
      console.warn(
        `Refreshed the Shopify token for ${shop} but could not copy it to the Shop row.`,
        error,
      );
    }
  }

  return refreshed.accessToken;
}

async function loadSession(shop: string) {
  if (!prisma) {
    return null;
  }
  return prisma.session.findUnique({ where: { id: offlineSessionId(shop) } });
}

// Returns an offline access token for `shop` that Shopify should accept,
// refreshing it first when it is within five minutes of expiring.
//
// Pass `staleToken` after Shopify rejected a token with 401: the helper then
// refreshes even if the stored expiry looks fine, unless the stored token has
// already moved on from the one that failed.
export async function getOfflineAccessToken(
  shop: string,
  options: { staleToken?: string } = {},
): Promise<string> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required to call Shopify.");
  }

  const session = await loadSession(shop);

  if (!session) {
    // Installs made before the Session table was the source of truth. They
    // have no refresh token, so the stored copy is all there is.
    const shopRow = await prisma.shop.findUnique({
      where: { domain: shop },
      select: { offlineAccessToken: true },
    });
    if (!shopRow?.offlineAccessToken) {
      throw new Error("Shop is missing an offline access token.");
    }
    return decrypt(shopRow.offlineAccessToken);
  }

  const { staleToken } = options;

  if (staleToken ? session.accessToken !== staleToken : !needsRefresh(session)) {
    return session.accessToken;
  }

  if (!session.refreshToken) {
    return session.accessToken;
  }

  try {
    return await refreshUnderLock(shop, staleToken);
  } catch (error) {
    // The embedded app may have refreshed (or re-exchanged) the token
    // between our read and Shopify's answer, which kills the refresh token we
    // sent. If the row has moved on, use the new token instead of retiring a
    // perfectly healthy install.
    const latest = await loadSession(shop).catch(() => null);
    if (
      latest &&
      (latest.accessToken !== session.accessToken ||
        latest.refreshToken !== session.refreshToken) &&
      !needsRefresh(latest)
    ) {
      return latest.accessToken;
    }
    throw error;
  }
}

// Runs `work` with a valid offline token. If Shopify still answers 401, the
// token is refreshed once and `work` retried; a second 401 propagates as a
// ShopifyTokenRevokedError for withRevocationHandling to act on.
export async function withShopifyAccessToken<T>(
  shop: string,
  work: (accessToken: string) => Promise<T>,
): Promise<T> {
  const token = await getOfflineAccessToken(shop);

  try {
    return await work(token);
  } catch (error) {
    if (!(error instanceof ShopifyTokenRevokedError)) {
      throw error;
    }

    const retryToken = await getOfflineAccessToken(shop, { staleToken: token });
    if (retryToken === token) {
      // Nothing to refresh with; the rejection stands.
      throw error;
    }
    return work(retryToken);
  }
}
