"use client";

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
    };
  }
}

const SESSION_TOKEN_TIMEOUT_MS = 1500;
const SHOPIFY_READY_TIMEOUT_MS = 2500;
const SHOPIFY_READY_POLL_MS = 50;

function shouldWaitForShopify() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  return params.has("host") || window.self !== window.top;
}

export async function getShopifySessionToken() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.shopify?.idToken && shouldWaitForShopify()) {
    const startedAt = Date.now();

    while (!window.shopify?.idToken) {
      if (Date.now() - startedAt >= SHOPIFY_READY_TIMEOUT_MS) {
        break;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, SHOPIFY_READY_POLL_MS);
      });
    }
  }

  const idToken = window.shopify?.idToken;

  if (typeof idToken !== "function") {
    return null;
  }

  try {
    return await Promise.race<string | null>([
      idToken(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), SESSION_TOKEN_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  }
}
