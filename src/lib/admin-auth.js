import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "./customer-auth";
import { prisma } from "./prisma";

export const ADMIN_SESSION_COOKIE = "sabbybestcollection_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 8;
const ADMIN_CREDENTIAL_ID = "admin";

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function hash(value) {
  return createHash("sha256").update(value).digest();
}

function signaturesMatch(expected, received) {
  const expectedHash = hash(expected);
  const receivedHash = hash(received || "");
  return timingSafeEqual(expectedHash, receivedHash);
}

export function isAdminAuthConfigured() {
  return Boolean(process.env.ADMIN_USERNAME?.trim() && process.env.ADMIN_PASSWORD && sessionSecret());
}

export async function credentialsMatch(username, password) {
  const configuredUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  if (!configuredUsername || typeof username !== "string" || typeof password !== "string") return false;
  if (!signaturesMatch(configuredUsername, username.trim().toLowerCase())) return false;

  const credential = await prisma.adminCredential.findUnique({ where: { id: ADMIN_CREDENTIAL_ID } });
  if (credential) return verifyPassword(password, credential.passwordHash);

  const configuredPassword = process.env.ADMIN_PASSWORD;
  return Boolean(configuredPassword && signaturesMatch(configuredPassword, password));
}

export async function changeAdminPassword(currentPassword, newPassword) {
  const username = process.env.ADMIN_USERNAME?.trim();
  if (!username || !(await credentialsMatch(username, currentPassword))) return null;

  const passwordHash = await hashPassword(newPassword);
  await prisma.adminCredential.upsert({
    where: { id: ADMIN_CREDENTIAL_ID },
    create: { id: ADMIN_CREDENTIAL_ID, passwordHash, sessionVersion: 1 },
    update: { passwordHash, sessionVersion: { increment: 1 } },
  });
  return createAdminSession();
}

export async function createAdminSession() {
  const secret = sessionSecret();
  const username = process.env.ADMIN_USERNAME?.trim();
  if (!secret || !username) return null;
  const credential = await prisma.adminCredential.findUnique({
    where: { id: ADMIN_CREDENTIAL_ID },
    select: { sessionVersion: true },
  });
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = Buffer.from(JSON.stringify({
    role: "admin",
    username,
    expiresAt,
    sessionVersion: credential?.sessionVersion ?? 0,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return { value: `${payload}.${signature}`, expiresAt, username };
}

function parseAdminSession(session = "") {
  const secret = sessionSecret();
  const [payload, signature, extra] = session.split(".");
  if (!secret || extra || !payload || !signature) return null;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!signaturesMatch(expectedSignature, signature)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.role !== "admin"
      || typeof claims.username !== "string"
      || !claims.username
      || !Number.isFinite(claims.expiresAt)
      || claims.expiresAt <= Date.now()
      || claims.username !== process.env.ADMIN_USERNAME?.trim()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function hasValidAdminSession(session = "") {
  const claims = parseAdminSession(session);
  if (!claims) return false;
  try {
    const credential = await prisma.adminCredential.findUnique({
      where: { id: ADMIN_CREDENTIAL_ID },
      select: { sessionVersion: true },
    });
    return (claims.sessionVersion ?? 0) === (credential?.sessionVersion ?? 0);
  } catch {
    return false;
  }
}

export function getAdminSessionUsername(session = "") {
  return parseAdminSession(session)?.username || null;
}

export const adminSessionOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
