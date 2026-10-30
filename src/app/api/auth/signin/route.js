import { NextResponse } from "next/server";
import { createCustomerSession, customerSessionCookieOptions, CUSTOMER_SESSION_COOKIE, hashPassword, publicCustomer, verifyPassword } from "../../../../lib/customer-auth";
import { normalizeCustomerIdentifier } from "../../../../lib/customer-identity";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

const transientDatabaseErrorCodes = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]);
const signinRetryDelays = [500, 1000, 2000, 4000];
const customerSignInSelect = {
  id: true,
  username: true,
  email: true,
  phone: true,
  fullName: true,
  deliveryAddress: true,
  deliveryCity: true,
  passwordHash: true,
};

function isTransientDatabaseError(error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return transientDatabaseErrorCodes.has(code)
    || (error?.name === "PrismaClientInitializationError" && /Can't reach database server/i.test(error.message || ""));
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid sign-in details." }, { status: 400 });
  }

  const password = typeof body?.password === "string" ? body.password : "";
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  if (!password || password.length > 128) {
    return NextResponse.json({ error: "Enter your username or phone number and password." }, { status: 400 });
  }

  const contact = normalizeCustomerIdentifier(identifier);
  if (!contact) {
    return NextResponse.json({ error: "Username/phone or password is incorrect." }, { status: 401 });
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      const profile = contact.type === "phone"
        ? await prisma.customerProfile.findUnique({ where: { phone: contact.phone }, select: customerSignInSelect })
        : await prisma.customerProfile.findUnique({ where: { username: identifier }, select: customerSignInSelect });
      const passwordMatches = profile
        ? await verifyPassword(password, profile.passwordHash)
        : (await hashPassword(password), false);
      if (!profile || !passwordMatches) {
        return NextResponse.json({ error: "Username/phone or password is incorrect." }, { status: 401 });
      }

      const session = await createCustomerSession(profile);
      const response = NextResponse.json({ session: { user: publicCustomer(profile) } });
      response.cookies.set(CUSTOMER_SESSION_COOKIE, session.token, customerSessionCookieOptions);
      return response;
    } catch (error) {
      const retryDelay = signinRetryDelays[attempt];
      if (isTransientDatabaseError(error) && retryDelay !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      console.error("Could not sign in customer:", error);
      if (isTransientDatabaseError(error)) {
        return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again in a moment." }, { status: 503 });
      }
      return NextResponse.json({ error: "Could not sign in. Please try again." }, { status: 500 });
    }
  }
}
