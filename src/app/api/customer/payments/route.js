import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/customer-auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to view your payment receipts." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const attempts = await prisma.paymentAttempt.findMany({
      where: {
        userId: user.id,
        status: "successful",
        orderId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        reference: true,
        amount: true,
        currency: true,
        updatedAt: true,
        order: {
          select: {
            id: true,
            items: true,
          },
        },
      },
    });
    const receipts = attempts.flatMap((attempt) => attempt.order ? [{
      reference: attempt.reference,
      amount: attempt.amount / 100,
      currency: attempt.currency,
      paid_at: attempt.updatedAt.toISOString(),
      order_id: attempt.order.id,
      items: attempt.order.items,
    }] : []);

    return NextResponse.json({ receipts }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Could not load customer payment receipts:", error);
    return NextResponse.json({ error: "Could not load your payment receipts." }, { status: 503 });
  }
}