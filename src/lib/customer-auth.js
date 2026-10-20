import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./prisma";

const scryptAsync = promisify(scrypt);
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const CUSTOMER_SESSION_COOKIE = "sabbybestcollection_customer_session";

export const customerSessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

export function publicCustomer(profile) {
  return {
    id: profile.id,
    email: profile.email,
    phone: profile.phone,
    user_metadata: { full_name: profile.fullName },
  };
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${Buffer.from(derivedKey).toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  const [salt, key, extra] = storedHash.split(":");
  if (!salt || !key || extra) return false;
  const expected = Buffer.from(key, "hex");
  const actual = Buffer.from(await scryptAsync(password, salt, expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createCustomerSession(profile, database = prisma) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await database.customerSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: profile.id,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function getAuthenticatedUser(request) {
  const token = request.cookies?.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token || !process.env.DATABASE_URL) return null;

  try {
    const session = await prisma.customerSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) return null;
    return session.user;
  } catch (error) {
    console.error("Could not resolve customer session:", error);
    return null;
  }
}

export function sessionResponse(profile) {
  return { user: publicCustomer(profile) };
}
