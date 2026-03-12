import { JobStatus } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const retrySchema = z.object({
  shop: z.string().optional(),
  jobId: z.string().min(1).optional(),
  retryAllFailed: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required." },
      { status: 503 },
    );
  }

  try {
    const body = retrySchema.parse(await request.json());
    const requestShop = await resolveShopFromRequest(request, { requireJwt: true });
    const shopDomain = requestShop ?? body.shop ?? null;

    if (!shopDomain) {
      return NextResponse.json({ error: "Shop is required." }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Connected shop not found." },
        { status: 404 },
      );
    }

    if (body.retryAllFailed) {
      const result = await prisma.queueJob.updateMany({
        where: {
          shopId: shop.id,
          status: JobStatus.FAILED,
        },
        data: {
          status: JobStatus.PENDING,
          availableAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });

      return NextResponse.json({
        ok: true,
        retriedCount: result.count,
      });
    }

    if (body.jobId) {
      const job = await prisma.queueJob.findFirst({
        where: {
          id: body.jobId,
          shopId: shop.id,
          status: JobStatus.FAILED,
        },
      });

      if (!job) {
        return NextResponse.json(
          { error: "Failed job not found." },
          { status: 404 },
        );
      }

      await prisma.queueJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.PENDING,
          availableAt: new Date(),
          lockedAt: null,
          lastError: null,
          attempts: 0,
        },
      });

      return NextResponse.json({ ok: true, retriedJobId: job.id });
    }

    return NextResponse.json(
      { error: "Provide jobId or retryAllFailed." },
      { status: 400 },
    );
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Job retry failed.",
      },
      { status },
    );
  }
}
