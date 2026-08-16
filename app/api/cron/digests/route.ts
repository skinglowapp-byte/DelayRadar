import { NextResponse } from "@/src/lib/next-response";

import { scheduleDueDigests } from "@/src/lib/digest/schedule-due";
import { prisma } from "@/src/lib/prisma";
import { isAuthorizedCron } from "@/src/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// This route is kept for manual/administrative triggering. On Hobby the digest
// scheduling is folded into /api/cron/worker to stay within the 2-cron limit,
// so this is NOT registered as a Vercel cron.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json(
      { error: "Unauthorized cron invocation." },
      { status: 401 },
    );
  }

  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to schedule digests." },
      { status: 503 },
    );
  }

  const result = await scheduleDueDigests();

  return NextResponse.json({ ok: true, ...result });
}
