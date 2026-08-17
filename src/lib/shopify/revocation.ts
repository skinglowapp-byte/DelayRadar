import { prisma } from "@/src/lib/prisma";

import { ShopifyTokenRevokedError } from "./admin";

// Records that Shopify no longer accepts a shop's token. Shopify sends
// app/uninstalled on uninstall, but that webhook can be missed — a delivery
// failure, or an uninstall that happened while the endpoint was broken — and
// nothing ever retries it. Without this, a Shop row stays isInstalled forever
// and every sweep keeps spending calls on a store that revoked us.
//
// Clearing the token matters as much as the flag: it is what stops the shop
// being picked up again, and a revoked token has no further use.
export async function markShopTokenRevoked(shopId: string) {
  if (!prisma) {
    return;
  }

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      isInstalled: false,
      offlineAccessToken: null,
      uninstalledAt: new Date(),
    },
  });
}

// Runs `work`, and if Shopify rejects the token, marks the shop and swallows
// the error. Returns whether the shop is still connected, so callers can skip
// the rest of their work without treating a revoked install as a failure.
export async function withRevocationHandling<T>(
  shopId: string,
  work: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; revoked: true }> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof ShopifyTokenRevokedError) {
      await markShopTokenRevoked(shopId);
      console.warn(`${error.message} Marked the shop uninstalled.`);
      return { ok: false, revoked: true };
    }
    throw error;
  }
}
