import { NextResponse } from "@/src/lib/next-response";

import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

export async function POST(request: Request) {
  const shop = await resolveShopFromRequest(request);
  return NextResponse.json({ ok: true, shop });
}
