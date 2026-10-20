import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "../../../../lib/customer-auth";
import { maskCustomerIdentifier, normalizeCustomerIdentifier } from "../../../../lib/customer-identity";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

const CODE_LIFETIME_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_MS = 60 * 1000;

async function sendEmailCode(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Email verification is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your SabbyBestCollection verification code",
      text: `Your SabbyBestCollection verification code is ${code}. It expires in five minutes.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Email provider rejected the verification message.");
}

async function sendPhoneCode(number) {
  const apiKey = process.env.ARKESEL_API_KEY;
  const senderId = process.env.ARKESEL_SENDER_ID;
  if (!apiKey || !senderId) throw new Error("Phone verification is not configured.");

  const response = await fetch("https://sms.arkesel.com/api/otp/generate", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      expiry: 5,
      length: 6,
      medium: "sms",
      message: "Your SabbyBestCollection verification code is %otp_code%. It expires in 5 minutes.",
      number,
      sender_id: senderId,
      type: "numeric",
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || String(result.code) !== "1000") {
    throw new Error("Phone provider rejected the verification message.");
  }
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
  if (!body) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
  const contact = normalizeCustomerIdentifier(body.identifier);
  if (!contact) return NextResponse.json({ error: "Enter a valid email address or phone number." }, { status: 400 });

  try {
    const existingProfile = await prisma.customerProfile.findUnique({
      where: contact.type === "email" ? { email: contact.email } : { phone: contact.phone },
      select: { id: true },
    });
    if (existingProfile) {
      return NextResponse.json({ error: "An account with this contact already exists. Log in instead.", existingAccount: true }, { status: 409 });
    }

    const previousChallenge = await prisma.customerVerification.findUnique({ where: { identifier: contact.identifier } });
    if (previousChallenge && Date.now() - previousChallenge.updatedAt.getTime() < SEND_COOLDOWN_MS) {
      return NextResponse.json({ error: "Please wait a minute before requesting another code." }, { status: 429 });
    }

    const code = contact.type === "email" ? String(randomInt(100000, 1000000)) : null;
    const codeHash = code ? await hashPassword(code) : null;
    const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS);
    await prisma.customerVerification.upsert({
      where: { identifier: contact.identifier },
      create: {
        identifier: contact.identifier,
        destination: contact.destination,
        channel: contact.type,
        codeHash,
        expiresAt,
      },
      update: {
        destination: contact.destination,
        channel: contact.type,
        codeHash,
        attempts: 0,
        expiresAt,
        verifiedAt: null,
      },
    });

    try {
      if (contact.type === "email") await sendEmailCode(contact.email, code);
      else await sendPhoneCode(contact.destination);
    } catch (error) {
      await prisma.customerVerification.deleteMany({ where: { identifier: contact.identifier } });
      if (error.name === "TimeoutError") {
        return NextResponse.json({ error: "The verification service timed out. Please try again." }, { status: 503 });
      }
      const configurationError = error.message.includes("not configured");
      return NextResponse.json({
        error: configurationError ? error.message : "Could not send a verification code. Check the contact and try again.",
      }, { status: 503 });
    }

    return NextResponse.json({ channel: contact.type, destination: maskCustomerIdentifier(contact) });
  } catch (error) {
    console.error("Could not start customer verification:", error);
    return NextResponse.json({ error: "Could not start verification. Please try again." }, { status: 503 });
  }
}

export async function PATCH(request) {
  const body = await parseRequest(request);
  if (!body) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
  const contact = normalizeCustomerIdentifier(body.identifier);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!contact || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the six-digit verification code." }, { status: 400 });
  }

  try {
    const challenge = await prisma.customerVerification.findUnique({ where: { identifier: contact.identifier } });
    if (!challenge || challenge.expiresAt <= new Date()) {
      if (challenge) await prisma.customerVerification.delete({ where: { id: challenge.id } });
      return NextResponse.json({ error: "That verification code has expired. Request a new one." }, { status: 410 });
    }
    if (challenge.verifiedAt) return NextResponse.json({ verified: true });
    if (challenge.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Too many incorrect codes. Request a new code." }, { status: 429 });
    }

    let matches = false;
    if (challenge.channel === "email") {
      matches = Boolean(challenge.codeHash && await verifyPassword(code, challenge.codeHash));
    } else {
      const apiKey = process.env.ARKESEL_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "Phone verification is not configured." }, { status: 503 });
      const response = await fetch("https://sms.arkesel.com/api/otp/verify", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ code, number: challenge.destination }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status >= 500 || response.status === 429 || response.status === 401) {
        throw new Error("Phone verification service is unavailable.");
      }
      matches = response.ok && String(result.code) === "1100";
    }

    if (!matches) {
      await prisma.customerVerification.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      return NextResponse.json({ error: "That verification code is incorrect." }, { status: 400 });
    }

    await prisma.customerVerification.update({ where: { id: challenge.id }, data: { verifiedAt: new Date() } });
    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Could not verify customer contact:", error);
    return NextResponse.json({ error: "Could not verify the code. Please try again." }, { status: 503 });
  }
}