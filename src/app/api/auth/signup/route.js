import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/customer-auth";
import { normalizeCustomerIdentifier } from "../../../../lib/customer-identity";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

const transientDatabaseErrorCodes = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]);
const signupRetryDelays = [500, 1000, 2000, 4000];

function isTransientDatabaseError(error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return transientDatabaseErrorCodes.has(code)
    || (error?.name === "PrismaClientInitializationError" && /Can't reach database server/i.test(error.message || ""));
}

async function createCustomerProfile({ username, phone, passwordHash }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const existing = await prisma.customerProfile.findFirst({
        where: { OR: [{ phone }, { username }] },
        select: { id: true },
      });
      if (existing) return "existing";

      await prisma.customerProfile.create({
        data: { username, phone, passwordHash },
      });
      return "created";
    } catch (error) {
      const retryDelay = signupRetryDelays[attempt];
      if (!isTransientDatabaseError(error) || retryDelay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid sign-up details." }, { status: 400 });
  }

  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const contact = normalizeCustomerIdentifier(body?.phone);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username) || !contact || contact.type !== "phone" || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Enter a username, valid phone number, and password between 8 and 128 characters." }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = await createCustomerProfile({ username, phone: contact.phone, passwordHash });
    if (result === "existing") {
      return NextResponse.json({ error: "That username or phone number is already in use. Log in instead.", existingAccount: true }, { status: 409 });
    }
    return NextResponse.json({ message: "Account created. Log in with your username or phone number." }, { status: 201 });
  } catch (error) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "That username or phone number is already in use. Log in instead.", existingAccount: true }, { status: 409 });
    }
    console.error("Could not create customer account:", error);
    if (isTransientDatabaseError(error)) {
      return NextResponse.json({ error: "Account creation is temporarily unavailable. Please try again in a moment." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }
}
