import "@shopify/shopify-app-react-router/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import db from "./db.server";

import { ensureDefaultAutomation } from "@/src/lib/data/defaults";
import { getAppUrl, getShopifyScopes } from "@/src/lib/env";
import { enqueueJob } from "@/src/lib/jobs";
import { upsertInstalledShop } from "@/src/lib/shopify/oauth";
import { prisma } from "@/src/lib/prisma";

const scopes = getShopifyScopes()
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes,
  appUrl: getAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      if (!session.accessToken) {
        return;
      }

      // For online sessions, still ensure the Shop record exists so the
      // bootstrap API doesn't return "install" mode while waiting for the
      // offline token exchange to complete.
      const existingShop = prisma
        ? await prisma.shop.findUnique({
            where: { domain: session.shop },
            select: {
              id: true,
              isInstalled: true,
            },
          })
        : null;

      const installedShop = await upsertInstalledShop({
        shop: session.shop,
        accessToken: session.accessToken,
        scope: session.scope ?? scopes.join(","),
      });

      await ensureDefaultAutomation(installedShop.id);

      // Only backfill on the first install (not on every online token refresh).
      if (!existingShop?.isInstalled && !session.isOnline) {
        await enqueueJob({
          shopId: installedShop.id,
          type: "BACKFILL_SHIPMENTS",
          payload: {
            shopId: installedShop.id,
          },
        });
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
