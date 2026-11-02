import { NextResponse } from "next/server";
import { getPaystackSecretKey, isValidPaystackWebhookSignature } from "../../../../lib/paystack";
import { verifyAndRecordPaystackPayment } from "../../../../lib/paystack-payments";

export const runtime = "nodejs";

export async function POST(request) {
  let secretKey;
  try {
    secretKey = getPaystackSecretKey();
  } catch {
    return NextResponse.json({ error: "Paystack is not configured." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });

  const rawBody = await request.text();
  if (rawBody.length > 64 * 1024) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  if (!isValidPaystackWebhookSignature(rawBody, request.headers.get("x-paystack-signature"), secretKey)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (event.event !== "charge.success") return NextResponse.json({ received: true });
  const reference = event.data?.reference;
  if (typeof reference !== "string" || reference.length > 200) {
    return NextResponse.json({ error: "Invalid transaction reference." }, { status: 400 });
  }

  try {
    const result = await verifyAndRecordPaystackPayment(reference);
    if (!result.verified && result.reason !== "unknown_reference" && result.reason !== "attempt_not_pending") {
      console.error("Paystack webhook transaction verification did not match the stored payment attempt.");
      return NextResponse.json({ error: "Payment verification failed." }, { status: 409 });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Could not process Paystack webhook:", error);
    return NextResponse.json({ error: "Could not process the payment notification." }, { status: 503 });
  }
}
