import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

export async function requireShopDomain(
  request: Request,
): Promise<{ shopDomain: string; response: null } | { shopDomain: null; response: Response }> {
  const shopDomain = await resolveShopFromRequest(request, { requireJwt: true });

  if (!shopDomain) {
    return {
      shopDomain: null,
      response: NextResponse.json({ error: "Shop is required." }, { status: 400 }),
    };
  }

  return { shopDomain, response: null };
}

export function routeErrorResponse(error: unknown, fallbackMessage: string) {
  const status = error instanceof z.ZodError ? 400 : 500;

  return NextResponse.json(
    { error: error instanceof z.ZodError ? error.message : fallbackMessage },
    { status },
  );
}
