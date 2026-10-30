import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "../../../../lib/customer-auth";
import { maskCustomerIdentifier, normalizeCustomerIdentifier } from "../../../../lib/customer-identity";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

const CODE_LIFETIME_MS = 5 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const genericRequestMessage = "If an account exists for that email, a password reset code has been sent.";

function resetIdentifier(email) {
  return `password-reset:${email}`;
}

function parseEmail(value) {
  const contact = normalizeCustomerIdentifier(value);
  return contact?.type === "email" ? contact : null;
}

async function sendPasswordResetEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your SabbyBestCollection password reset code",
      text: `Your password reset code is ${code}. It expires in five minutes. If you did not request this, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Email provider rejected the password reset message.");
}

async function parseRequest(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  const body = await parseRequest(request);
  if (!body) return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });

  const contact = parseEmail(body.email);
  if (!contact) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const destination = maskCustomerIdentifier(contact);
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error("Could not send password reset email: email delivery is not configured.");
    return NextResponse.json({ error: "Password reset email delivery is not configured. Please contact the store for help." }, { status: 503 });
  }

  try {
    const profile = await prisma.customerProfile.findUnique({
      where: { email: contact.email },
      select: { id: true },
    });
    if (!profile) return NextResponse.json({ message: genericRequestMessage, destination });

    const identifier = resetIdentifier(contact.email);
    const previousChallenge = await prisma.customerVerification.findUnique({ where: { identifier } });
    if (previousChallenge && Date.now() - previousChallenge.updatedAt.getTime() < SEND_COOLDOWN_MS) {
      return NextResponse.json({ message: genericRequestMessage, destination });
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS);
    await prisma.customerVerification.upsert({
      where: { identifier },
      create: {
        identifier,
        destination: contact.email,
        channel: "email",
        codeHash,
        expiresAt,
      },
      update: {
        destination: contact.email,
        channel: "email",
        codeHash,
        attempts: 0,
        expiresAt,
        verifiedAt: null,
      },
    });

    try {
      await sendPasswordResetEmail(contact.email, code);
    } catch (error) {
      await prisma.customerVerification.deleteMany({ where: { identifier, codeHash } });
      if (error.name === "TimeoutError") {
        return NextResponse.json({ error: "The email service timed out. Please try again." }, { status: 503 });
      }
      if (error.message === "Email delivery is not configured.") {
        console.error("Could not send password reset email: email delivery is not configured.");
        return NextResponse.json({ error: "Password reset email delivery is not configured. Please contact the store for help." }, { status: 503 });
      }
      console.error("Could not send password reset email:", error);
      return NextResponse.json({ error: "Could not send a password reset code. Please try again." }, { status: 503 });
    }

    return NextResponse.json({ message: genericRequestMessage, destination });
  } catch (error) {
    console.error("Could not start customer password reset:", error);
    return NextResponse.json({ error: "Could not start password reset. Please try again." }, { status: 503 });
  }
}

export async function PATCH(request) {
  const body = await parseRequest(request);
  if (!body) return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });

  const contact = parseEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!contact || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Enter the six-digit code and a password between 8 and 128 characters." }, { status: 400 });
  }

  const identifier = resetIdentifier(contact.email);
  try {
    const challenge = await prisma.customerVerification.findUnique({ where: { identifier } });
    if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= MAX_ATTEMPTS || !challenge.codeHash) {
      if (challenge && challenge.expiresAt <= new Date()) {
        await prisma.customerVerification.deleteMany({ where: { id: challenge.id } });
      }
      return NextResponse.json({ error: "That reset code is invalid or expired. Request a new code." }, { status: 400 });
    }

    if (!await verifyPassword(code, challenge.codeHash)) {
      await prisma.customerVerification.updateMany({
        where: { id: challenge.id, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ error: "That reset code is invalid or expired. Request a new code." }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const reset = await prisma.$transaction(async (transaction) => {
      const currentChallenge = await transaction.customerVerification.findUnique({ where: { identifier } });
      if (!currentChallenge
        || currentChallenge.id !== challenge.id
        || currentChallenge.codeHash !== challenge.codeHash
        || currentChallenge.expiresAt <= new Date()
        || currentChallenge.attempts >= MAX_ATTEMPTS) return false;

      const consumed = await transaction.customerVerification.deleteMany({
        where: {
          id: currentChallenge.id,
          codeHash: currentChallenge.codeHash,
          attempts: currentChallenge.attempts,
        },
      });
      if (consumed.count !== 1) return false;

      const profile = await transaction.customerProfile.findUnique({
        where: { email: contact.email },
        select: { id: true },
      });
      if (!profile) return false;

      await transaction.customerProfile.update({
        where: { id: profile.id },
        data: { passwordHash, updatedAt: new Date() },
      });
      await transaction.customerSession.deleteMany({ where: { userId: profile.id } });
      return true;
    });

    if (!reset) {
      return NextResponse.json({ error: "That reset code is invalid or expired. Request a new code." }, { status: 400 });
    }
    return NextResponse.json({ message: "Your password has been reset. You can now log in." });
  } catch (error) {
    console.error("Could not reset customer password:", error);
    return NextResponse.json({ error: "Could not reset your password. Please try again." }, { status: 503 });
  }
}
