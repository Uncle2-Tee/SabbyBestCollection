import { NextResponse } from "next/server";
import { CUSTOMER_SESSION_COOKIE, customerSessionCookieOptions, restoreCustomerSession, sessionResponse } from "../../../../lib/customer-auth";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const restoredSession = await restoreCustomerSession(request);
    const response = NextResponse.json({
      session: restoredSession ? sessionResponse(restoredSession.user) : null,
    });
    if (restoredSession) {
      response.cookies.set(CUSTOMER_SESSION_COOKIE, restoredSession.token, customerSessionCookieOptions);
    }
    return response;
  } catch (error) {
    console.error("Could not load customer session:", error);
    return NextResponse.json({ error: "Could not check your sign-in session. Please try again." }, { status: 503 });
  }
}
