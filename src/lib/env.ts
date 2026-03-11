function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

export function getAppUrl() {
  return trimTrailingSlash(
    process.env.SHOPIFY_APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000",
  );
}

export function getShopifyApiKey() {
  return (
    process.env.SHOPIFY_API_KEY ??
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ??
    ""
  );
}

export function getShopifyScopes() {
  return (
    process.env.SCOPES ??
    process.env.SHOPIFY_SCOPES ??
    "read_orders,read_fulfillments"
  );
}
