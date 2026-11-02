import { NextResponse } from "next/server";
import { verifyAndRecordPaystackPayment } from "../../../../lib/paystack-payments";

export const runtime = "nodejs";

function paymentRedirect(request, result) {
  const baseUrl = process.env.PAYSTACK_CALLBACK_URL || (process.env.NODE_ENV === "development" ? request.url : "");
  if (!baseUrl) return NextResponse.json({ error: "Paystack callback URL is not configured." }, { status: 503 });
  const url = new URL("/", baseUrl);
  url.searchParams.set("payment", result);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  if (!reference || reference.length > 200) return paymentRedirect(request, "failed");

  try {
    const result = await verifyAndRecordPaystackPayment(reference);
    return paymentRedirect(request, result.verified ? "success" : "failed");
  } catch (error) {
    console.error("Could not verify Paystack callback:", error);
    return paymentRedirect(request, "verification-pending");
  }
}
