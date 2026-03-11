import { NextResponse } from "@/src/lib/next-response";

import { getAppBootstrap } from "@/src/lib/data/loaders";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const shop = await resolveShopFromRequest(request);
    const payload = await getAppBootstrap(shop);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load DelayRadar bootstrap data.",
      },
      { status: 500 },
    );
  }
}
