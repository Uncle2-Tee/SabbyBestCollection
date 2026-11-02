import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/customer-auth";
import { prisma } from "../../../../lib/prisma";
import { getPaystackCallbackUrl, getPaystackSecretKey, initializePaystackTransaction } from "../../../../lib/paystack";

export const runtime = "nodejs";

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in before starting payment." }, { status: 401 });

  let orderId;
  try {
    ({ orderId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });
  }
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "Provide a valid order." }, { status: 400 });
  }

  try {
    getPaystackSecretKey();
  } catch {
    return NextResponse.json({ error: "Paystack is not configured for payments." }, { status: 503 });
  }

  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id } });
    if (!order) return NextResponse.json({ error: "Order was not found." }, { status: 404 });
    if (order.status !== "awaiting_payment" || order.paymentMethod !== "paystack") {
      return NextResponse.json({ error: "This order is not awaiting Paystack payment." }, { status: 409 });
    }
    if (!order.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customerEmail)) {
      return NextResponse.json({ error: "A valid email address is required for Paystack checkout." }, { status: 400 });
    }

    const amount = Math.round(Number(order.total) * 100);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return NextResponse.json({ error: "The order total is invalid for payment." }, { status: 400 });
    }

    let callbackUrl;
    try {
      callbackUrl = getPaystackCallbackUrl(request.url);
    } catch {
      return NextResponse.json({ error: "Configure PAYSTACK_CALLBACK_URL as the HTTPS /api/paystack/callback URL." }, { status: 503 });
    }

    const attempt = await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        reference: `sbc_${randomUUID().replaceAll("-", "")}`,
        amount,
      },
    });
    try {
      const transaction = await initializePaystackTransaction({
        email: order.customerEmail,
        amount,
        reference: attempt.reference,
        callbackUrl,
        metadata: { order_id: order.id, payment_attempt_id: attempt.id },
      });
      if (transaction.reference !== attempt.reference) {
        throw new Error("Paystack returned a mismatched transaction reference.");
      }
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "pending" } });
      return NextResponse.json({ authorizationUrl: transaction.authorizationUrl });
    } catch (error) {
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "failed" } });
      console.error("Could not initialize Paystack checkout:", error);
      return NextResponse.json({ error: "Could not start Paystack checkout. Please try again." }, { status: 502 });
    }
  } catch (error) {
    console.error("Could not prepare Paystack payment:", error);
    return NextResponse.json({ error: "Could not prepare payment for this order." }, { status: 500 });
  }
}
