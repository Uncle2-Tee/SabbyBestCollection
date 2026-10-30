import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/customer-auth";
import { normalizeCustomerIdentifier } from "../../../../lib/customer-identity";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

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
    const profile = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.customerProfile.findUnique({
        where: { phone: contact.phone },
        select: { id: true },
      });
      const existingUsername = await transaction.customerProfile.findUnique({
        where: { username },
        select: { id: true },
      });
      if (existing || existingUsername) return "existing";

      const created = await transaction.customerProfile.create({
        data: { username, phone: contact.phone, passwordHash },
      });
      return created;
    });

    if (profile === "existing") {
      return NextResponse.json({ error: "That username or phone number is already in use. Log in instead.", existingAccount: true }, { status: 409 });
    }
    if (!profile) {
      return NextResponse.json({ error: "Could not create your account." }, { status: 400 });
    }
    return NextResponse.json({ message: "Account created. Log in with your username or phone number." }, { status: 201 });
  } catch (error) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "That username or phone number is already in use. Log in instead.", existingAccount: true }, { status: 409 });
    }
    console.error("Could not create customer account:", error);
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }
}
