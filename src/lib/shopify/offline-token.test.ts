import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SessionRow = {
  id: string;
  accessToken: string;
  expires: Date | null;
  refreshToken: string | null;
  refreshTokenExpires: Date | null;
  scope: string | null;
};

const SHOP = "test-shop.myshopify.com";
const SESSION_ID = `offline_${SHOP}`;

const state = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  shopToken: null as string | null,
  // Lets a test change the row while a refresh request is in flight,
  // standing in for the embedded app refreshing it concurrently.
  onFetch: null as null | (() => void),
}));

vi.mock("@/src/lib/prisma", () => {
  const session = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = state.sessions.get(where.id);
      return row ? { ...(row as object) } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: object }) => {
      const row = { ...(state.sessions.get(where.id) as object), ...data };
      state.sessions.set(where.id, row);
      return row;
    },
  };
  const shop = {
    findUnique: async () => ({ offlineAccessToken: state.shopToken }),
    updateMany: async ({ data }: { data: { offlineAccessToken: string } }) => {
      state.shopToken = data.offlineAccessToken;
      return { count: 1 };
    },
  };
  const tx = { session, shop, $executeRaw: async () => 0 };
  return {
    prisma: {
      session,
      shop,
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

const { getOfflineAccessToken, withShopifyAccessToken, ShopifyTokenRefreshError } =
  await import("./offline-token");
const { ShopifyTokenRevokedError } = await import("./admin");
const { decrypt } = await import("@/src/lib/crypto");

function putSession(overrides: Partial<SessionRow> = {}) {
  state.sessions.set(SESSION_ID, {
    id: SESSION_ID,
    accessToken: "old-access",
    expires: new Date(Date.now() + 60 * 60_000),
    refreshToken: "old-refresh",
    refreshTokenExpires: new Date(Date.now() + 90 * 24 * 3600_000),
    scope: "read_orders",
    ...overrides,
  });
}

function session() {
  return state.sessions.get(SESSION_ID) as SessionRow;
}

const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockImplementationOnce(async () => {
    state.onFetch?.();
    return new Response(JSON.stringify(body), { status });
  });
}

function respondWithFreshToken() {
  respond(200, {
    access_token: "new-access",
    scope: "read_orders",
    expires_in: 3600,
    refresh_token: "new-refresh",
    refresh_token_expires_in: 7_776_000,
  });
}

beforeEach(() => {
  state.sessions.clear();
  state.shopToken = null;
  state.onFetch = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SHOPIFY_API_KEY", "key");
  vi.stubEnv("SHOPIFY_API_SECRET", "secret");
  vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getOfflineAccessToken", () => {
  it("returns a token that is not near expiry without calling Shopify", async () => {
    putSession();
    await expect(getOfflineAccessToken(SHOP)).resolves.toBe("old-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a token near expiry and persists both rows", async () => {
    putSession({ expires: new Date(Date.now() + 60_000) });
    respondWithFreshToken();

    await expect(getOfflineAccessToken(SHOP)).resolves.toBe("new-access");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://${SHOP}/admin/oauth/access_token`);
    expect(JSON.parse(init.body)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
      client_id: "key",
      client_secret: "secret",
    });

    expect(session().accessToken).toBe("new-access");
    expect(session().refreshToken).toBe("new-refresh");
    expect(session().expires!.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
    expect(decrypt(state.shopToken!)).toBe("new-access");
  });

  it("does not refresh when the token that failed has already been replaced", async () => {
    putSession({ accessToken: "already-new" });
    await expect(
      getOfflineAccessToken(SHOP, { staleToken: "old-access" }),
    ).resolves.toBe("already-new");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes after a 401 even when the stored expiry looks fine", async () => {
    putSession();
    respondWithFreshToken();
    await expect(
      getOfflineAccessToken(SHOP, { staleToken: "old-access" }),
    ).resolves.toBe("new-access");
  });

  it("uses the row's new token when a concurrent refresh beat ours", async () => {
    putSession({ expires: new Date(Date.now() + 60_000) });
    state.onFetch = () => {
      // The embedded app re-exchanged the token while our request was out,
      // so the refresh token we sent is dead.
      putSession({ accessToken: "app-access", refreshToken: "app-refresh" });
    };
    respond(400, { error: "invalid_subject_token" });

    await expect(getOfflineAccessToken(SHOP)).resolves.toBe("app-access");
  });

  it("treats invalid_subject_token as revoked", async () => {
    putSession({ expires: new Date(Date.now() + 60_000) });
    respond(400, { error: "invalid_subject_token" });
    await expect(getOfflineAccessToken(SHOP)).rejects.toBeInstanceOf(
      ShopifyTokenRevokedError,
    );
    expect(session().accessToken).toBe("old-access");
  });

  it("treats an expired refresh token as revoked without calling Shopify", async () => {
    putSession({
      expires: new Date(Date.now() - 60_000),
      refreshTokenExpires: new Date(Date.now() - 60_000),
    });
    await expect(getOfflineAccessToken(SHOP)).rejects.toBeInstanceOf(
      ShopifyTokenRevokedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a retryable error, not a revocation, on a Shopify 5xx", async () => {
    putSession({ expires: new Date(Date.now() + 60_000) });
    respond(502, { error: "bad gateway" });
    const error = await getOfflineAccessToken(SHOP).catch((e) => e);
    expect(error).toBeInstanceOf(ShopifyTokenRefreshError);
    expect(error).not.toBeInstanceOf(ShopifyTokenRevokedError);
  });

  it("falls back to the Shop row for installs with no Session row", async () => {
    const { encrypt } = await import("@/src/lib/crypto");
    state.shopToken = encrypt("legacy-token");
    await expect(getOfflineAccessToken(SHOP)).resolves.toBe("legacy-token");
  });
});

describe("withShopifyAccessToken", () => {
  it("refreshes and retries exactly once after a 401", async () => {
    putSession();
    respondWithFreshToken();
    const work = vi
      .fn()
      .mockRejectedValueOnce(new ShopifyTokenRevokedError(SHOP))
      .mockResolvedValueOnce("ok");

    await expect(withShopifyAccessToken(SHOP, work)).resolves.toBe("ok");
    expect(work.mock.calls.map((call) => call[0])).toEqual([
      "old-access",
      "new-access",
    ]);
  });

  it("lets a second 401 propagate", async () => {
    putSession();
    respondWithFreshToken();
    const work = vi.fn().mockRejectedValue(new ShopifyTokenRevokedError(SHOP));

    await expect(withShopifyAccessToken(SHOP, work)).rejects.toBeInstanceOf(
      ShopifyTokenRevokedError,
    );
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("does not retry when there is no refresh token", async () => {
    putSession({ refreshToken: null, refreshTokenExpires: null });
    const work = vi.fn().mockRejectedValue(new ShopifyTokenRevokedError(SHOP));

    await expect(withShopifyAccessToken(SHOP, work)).rejects.toBeInstanceOf(
      ShopifyTokenRevokedError,
    );
    expect(work).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes non-401 errors straight through", async () => {
    putSession();
    const work = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withShopifyAccessToken(SHOP, work)).rejects.toThrow("boom");
    expect(work).toHaveBeenCalledTimes(1);
  });
});
