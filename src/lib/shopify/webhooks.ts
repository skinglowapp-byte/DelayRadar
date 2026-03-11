import { createHmac, timingSafeEqual } from "node:crypto";

export async function readRawBody(request: Request) {
  return request.text();
}

export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!secret || !hmacHeader) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}
