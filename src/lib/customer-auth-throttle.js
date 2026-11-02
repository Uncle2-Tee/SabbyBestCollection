import { createHash } from "node:crypto";
import { prisma } from "./prisma";

const ACCOUNT_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 20;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000;

function hashThrottleKey(scope, value) {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

function getThrottleKey(scope, value) {
  return hashThrottleKey(scope, value || "unknown");
}

export function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();
  return forwardedIp || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getAccountThrottleKey(identifier, contact, isUsername) {
  if (isUsername) return getThrottleKey("username", identifier);
  if (contact?.phone) return getThrottleKey("phone", contact.phone);
  return null;
}

export function getCustomerProfileThrottleKey(profileId) {
  return profileId ? getThrottleKey("profile", profileId) : null;
}

async function getThrottle(key) {
  if (!key) return null;
  return prisma.customerAuthThrottle.findUnique({ where: { key } });
}

export async function getLoginThrottle({ accountKey, accountKeys = [], ip }) {
  const keys = [...new Set([accountKey, ...accountKeys, getThrottleKey("ip", ip)].filter(Boolean))];
  const records = await prisma.customerAuthThrottle.findMany({ where: { key: { in: keys } } });
  const now = Date.now();
  const blocked = records
    .map((record) => record.blockedUntil?.getTime() > now ? record.blockedUntil : null)
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return blocked ? { blockedUntil: blocked } : null;
}

export async function recordLoginFailure({ accountKey, accountKeys = [], ip }) {
  const now = Date.now();
  const ipKey = getThrottleKey("ip", ip);
  await recordThrottleFailure(ipKey, IP_FAILURE_LIMIT, now);
  for (const key of [...new Set([accountKey, ...accountKeys].filter(Boolean))]) {
    await recordThrottleFailure(key, ACCOUNT_FAILURE_LIMIT, now);
  }
}

async function recordThrottleFailure(key, limit, now) {
  const current = await getThrottle(key);
  const windowExpired = !current || now - current.windowStartedAt.getTime() >= FAILURE_WINDOW_MS;
  const failedAttempts = windowExpired ? 1 : current.failedAttempts + 1;
  const blockedUntil = failedAttempts >= limit
    ? new Date(now + ACCOUNT_LOCKOUT_MS)
    : null;
  const data = {
    failedAttempts,
    windowStartedAt: new Date(windowExpired ? now : current.windowStartedAt),
    blockedUntil,
  };
  if (!current) {
    try {
      await prisma.customerAuthThrottle.create({ data: { key, ...data } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      await recordThrottleFailure(key, limit, now);
    }
    return;
  }
  await prisma.customerAuthThrottle.update({ where: { key }, data });
}

export async function clearAccountLoginFailures(accountKey, accountKeys = []) {
  const keys = [...new Set([accountKey, ...accountKeys].filter(Boolean))];
  if (!keys.length) return;
  await prisma.customerAuthThrottle.deleteMany({ where: { key: { in: keys } } });
}

export function retryAfterSeconds(blockedUntil) {
  return Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
}
