import { WorkflowState } from "@prisma/client";
import { NextResponse } from "@/src/lib/next-response";
import { z } from "zod";

import { prisma } from "@/src/lib/prisma";
import { resolveShopFromRequest } from "@/src/lib/shopify/session-token";

const workflowSchema = z.object({
  shop: z.string().optional(),
  shipmentId: z.string().min(1),
  action: z.enum(["assign", "review", "snooze", "resolve", "reopen", "add_note", "accept_recommendation"]),
  assignedTo: z.string().optional(),
  snoozedUntil: z.string().optional(),
  noteBody: z.string().optional(),
  noteAuthor: z.string().optional(),
  recommendationLabel: z.string().optional(),
  recommendationAction: z.string().optional(),
});

export async function POST(request: Request) {
  if (!prisma) {
    return NextResponse.json(
      { error: "DATABASE_URL is required for workflow actions." },
      { status: 503 },
    );
  }

  try {
    const body = workflowSchema.parse(await request.json());
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

    const shipment = await prisma.shipment.findFirst({
      where: {
        id: body.shipmentId,
        shopId: shop.id,
      },
    });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found for this shop." },
        { status: 404 },
      );
    }

    switch (body.action) {
      case "assign": {
        const assignedTo = body.assignedTo?.trim() || null;
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: { assignedTo },
        });
        return NextResponse.json({ ok: true, action: "assign", assignedTo });
      }

      case "review": {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: { reviewedAt: new Date() },
        });
        return NextResponse.json({ ok: true, action: "review" });
      }

      case "snooze": {
        if (!body.snoozedUntil) {
          return NextResponse.json(
            { error: "snoozedUntil is required for snooze action." },
            { status: 400 },
          );
        }

        const snoozedUntil = new Date(body.snoozedUntil);

        if (Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= new Date()) {
          return NextResponse.json(
            { error: "snoozedUntil must be a valid future date." },
            { status: 400 },
          );
        }

        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            workflowState: WorkflowState.SNOOZED,
            snoozedUntil,
          },
        });
        return NextResponse.json({
          ok: true,
          action: "snooze",
          snoozedUntil: snoozedUntil.toISOString(),
        });
      }

      case "resolve": {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            workflowState: WorkflowState.RESOLVED,
            resolvedAt: new Date(),
            snoozedUntil: null,
          },
        });
        return NextResponse.json({ ok: true, action: "resolve" });
      }

      case "reopen": {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            workflowState: WorkflowState.OPEN,
            resolvedAt: null,
            snoozedUntil: null,
          },
        });
        return NextResponse.json({ ok: true, action: "reopen" });
      }

      case "add_note": {
        if (!body.noteBody?.trim()) {
          return NextResponse.json(
            { error: "Note body is required." },
            { status: 400 },
          );
        }

        const note = await prisma.shipmentNote.create({
          data: {
            shipmentId: shipment.id,
            author: body.noteAuthor?.trim() || "Team",
            body: body.noteBody.trim(),
          },
        });

        return NextResponse.json({
          ok: true,
          action: "add_note",
          noteId: note.id,
        });
      }

      case "accept_recommendation": {
        const recLabel = body.recommendationLabel?.trim() || "Recommendation accepted";
        const recAction = body.recommendationAction?.trim() || "unknown";

        await prisma.$transaction([
          prisma.shipmentNote.create({
            data: {
              shipmentId: shipment.id,
              author: "DelayRadar",
              body: `Accepted recommendation: ${recLabel} (action: ${recAction})`,
            },
          }),
          prisma.shipment.update({
            where: { id: shipment.id },
            data: {
              workflowState: WorkflowState.RESOLVED,
              resolvedAt: new Date(),
              snoozedUntil: null,
            },
          }),
        ]);

        return NextResponse.json({
          ok: true,
          action: "accept_recommendation",
          recommendationAction: recAction,
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown workflow action." },
          { status: 400 },
        );
    }
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.message
            : "Workflow action failed.",
      },
      { status },
    );
  }
}
