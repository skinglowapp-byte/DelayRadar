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
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // A malformed or empty JSON body is a client error, not a server fault.
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
