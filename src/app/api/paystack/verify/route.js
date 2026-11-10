import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/customer-auth";
import { prisma } from "../../../../lib/prisma";
import { verifyAndRecordPaystackPayment } from "../../../../lib/paystack-payments";

export const runtime = "nodejs";

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to verify your payment." }, { status: 401 });

  let reference;
  try {
    ({ reference } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid payment reference." }, { status: 400 });
  }
  if (typeof reference !== "string" || !reference || reference.length > 200) {
    return NextResponse.json({ error: "Provide a valid payment reference." }, { status: 400 });
  }

  try {
    const attempt = await prisma.paymentAttempt.findUnique({
      where: { reference },
      select: { userId: true },
    });
    if (!attempt || attempt.userId !== user.id) {
      return NextResponse.json({ error: "Payment attempt was not found." }, { status: 404 });
    }

    const result = await verifyAndRecordPaystackPayment(reference);
    if (!result.verified) {
      return NextResponse.json({ error: "Payment has not been verified yet." }, { status: 409 });
    }
    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Could not verify customer Paystack payment:", error);
    return NextResponse.json({ error: "Could not verify the payment yet." }, { status: 503 });
  }
}
