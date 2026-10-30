import { NextResponse } from "next/server";
import { createCustomerSession, customerSessionCookieOptions, CUSTOMER_SESSION_COOKIE, hashPassword, publicCustomer, verifyPassword } from "../../../../lib/customer-auth";
import { maskCustomerIdentifier, normalizeCustomerIdentifier } from "../../../../lib/customer-identity";
import { sendArkeselOtp, verifyArkeselOtp } from "../../../../lib/arkesel-otp";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

const LOGIN_CHALLENGE_PREFIX = "login:";
const CODE_LIFETIME_MS = 5 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

async function completePhoneSignIn(contact, code) {
  const identifier = `${LOGIN_CHALLENGE_PREFIX}${contact.identifier}`;
  const challenge = await prisma.customerVerification.findUnique({ where: { identifier } });
  if (!challenge || challenge.expiresAt <= new Date()) {
    if (challenge) await prisma.customerVerification.deleteMany({ where: { id: challenge.id } });
    return NextResponse.json({ error: "That verification code has expired. Request a new one." }, { status: 410 });
  }
  if (challenge.verifiedAt || challenge.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many verification attempts. Request a new code." }, { status: 429 });
  }

  const profile = await prisma.customerProfile.findUnique({ where: { phone: contact.phone } });
  if (!profile || challenge.destination !== contact.destination) {
    return NextResponse.json({ error: "That verification code has expired. Request a new one." }, { status: 410 });
  }

  const matches = await verifyArkeselOtp(challenge.destination, code);
  if (!matches) {
    const updated = await prisma.customerVerification.updateMany({
      where: { id: challenge.id, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (!updated.count) return NextResponse.json({ error: "Too many verification attempts. Request a new code." }, { status: 429 });
    return NextResponse.json({ error: "That verification code is incorrect." }, { status: 400 });
  }

  const session = await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.customerVerification.deleteMany({
      where: {
        id: challenge.id,
        verifiedAt: null,
        attempts: { lt: MAX_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
    });
    if (consumed.count !== 1) return null;
    return createCustomerSession(profile, transaction);
  });
  if (!session) return NextResponse.json({ error: "That verification code has expired or was already used. Request a new one." }, { status: 410 });

  const response = NextResponse.json({ session: { user: publicCustomer(profile) } });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, session.token, customerSessionCookieOptions);
  return response;
}

async function startPhoneSignIn(contact) {
  if (!process.env.ARKESEL_API_KEY || !process.env.ARKESEL_SENDER_ID) {
    return NextResponse.json({ error: "Phone verification is not configured." }, { status: 503 });
  }

  const identifier = `${LOGIN_CHALLENGE_PREFIX}${contact.identifier}`;
  const previousChallenge = await prisma.customerVerification.findUnique({ where: { identifier } });
  const elapsed = previousChallenge ? Date.now() - previousChallenge.updatedAt.getTime() : SEND_COOLDOWN_MS;
  if (previousChallenge && elapsed < SEND_COOLDOWN_MS) {
    return NextResponse.json({
      requiresVerification: true,
      destination: maskCustomerIdentifier(contact),
      retryAfterSeconds: Math.ceil((SEND_COOLDOWN_MS - elapsed) / 1000),
      sent: false,
    });
  }

  const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS);
  await prisma.customerVerification.upsert({
    where: { identifier },
    create: {
      identifier,
      destination: contact.destination,
      channel: "phone",
      codeHash: null,
      expiresAt,
    },
    update: {
      destination: contact.destination,
      channel: "phone",
      codeHash: null,
      attempts: 0,
      expiresAt,
      verifiedAt: null,
    },
  });

  try {
    await sendArkeselOtp(contact.destination);
  } catch (error) {
    await prisma.customerVerification.deleteMany({ where: { identifier } });
    if (error.name === "TimeoutError") {
      return NextResponse.json({ error: "The verification service timed out. Please try again." }, { status: 503 });
    }
    return NextResponse.json({
      error: error.userMessage || (error.message === "Phone verification is not configured."
        ? error.message
        : "Could not send a verification code. Check the phone number and try again."),
    }, { status: 503 });
  }

  return NextResponse.json({
    requiresVerification: true,
    destination: maskCustomerIdentifier(contact),
    retryAfterSeconds: SEND_COOLDOWN_MS / 1000,
    sent: true,
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid sign-in details." }, { status: 400 });
  }

  const contact = normalizeCustomerIdentifier(body?.identifier ?? body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!contact) {
    return NextResponse.json({ error: "Enter a valid email or phone number." }, { status: 400 });
  }
  if (body?.code !== undefined) {
    if (contact.type !== "phone" || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Enter the six-digit verification code." }, { status: 400 });
    }
    try {
      return await completePhoneSignIn(contact, code);
    } catch (error) {
      if (error.name === "TimeoutError") {
        return NextResponse.json({ error: "The verification service timed out. Please try again." }, { status: 503 });
      }
      console.error("Could not verify customer sign-in:", error);
      return NextResponse.json({ error: error.userMessage || "Could not verify the code. Please try again." }, { status: 503 });
    }
  }

  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || password.length > 128) {
    return NextResponse.json({ error: "Enter a valid email or phone number and password." }, { status: 400 });
  }

  try {
    const profile = await prisma.customerProfile.findUnique({
      where: contact.type === "email" ? { email: contact.email } : { phone: contact.phone },
    });
    const passwordMatches = profile
      ? await verifyPassword(password, profile.passwordHash)
      : (await hashPassword(password), false);
    if (!profile || !passwordMatches) {
      return NextResponse.json({ error: "Email/phone or password is incorrect." }, { status: 401 });
    }

    if (contact.type === "phone") return await startPhoneSignIn(contact);

    const session = await createCustomerSession(profile);
    const response = NextResponse.json({ session: { user: publicCustomer(profile) } });
    response.cookies.set(CUSTOMER_SESSION_COOKIE, session.token, customerSessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Could not sign in customer:", error);
    return NextResponse.json({ error: "Could not sign in. Please try again." }, { status: 500 });
  }
}
