const SHOPIFY_API_VERSION = "2025-10";

export async function shopifyAdminGraphql<T>(input: {
  shop: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}) {
  const response = await fetch(
    `https://${input.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": input.accessToken,
      },
      body: JSON.stringify({
        query: input.query,
        variables: input.variables ?? {},
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify Admin API failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((entry) => entry.message).join(", "));
  }

  if (!payload.data) {
    throw new Error("Shopify Admin API returned no data");
  }

  return payload.data;
}
