import { createHmac, timingSafeEqual } from "node:crypto";

const paystackApiUrl = "https://api.paystack.co";
const paystackSecretKeyPattern = /^sk_(live|test)_[A-Za-z0-9]+$/;

export function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || !paystackSecretKeyPattern.test(secretKey)) {
    throw new Error("PAYSTACK_SECRET_KEY is missing or invalid.");
  }
  return secretKey;
}

export function getPaystackCallbackUrl(requestUrl) {
  const configuredUrl = process.env.PAYSTACK_CALLBACK_URL;
  if (!configuredUrl && process.env.NODE_ENV !== "development") {
    throw new Error("PAYSTACK_CALLBACK_URL must be set outside development.");
  }

  const callbackUrl = configuredUrl || new URL("/api/paystack/callback", requestUrl).toString();
  const parsedUrl = new URL(callbackUrl);
  const allowedProtocols = process.env.NODE_ENV === "development" ? ["https:", "http:"] : ["https:"];
  if (!allowedProtocols.includes(parsedUrl.protocol)
    || parsedUrl.pathname !== "/api/paystack/callback"
    || parsedUrl.search
    || parsedUrl.hash) {
    throw new Error("PAYSTACK_CALLBACK_URL must be an HTTPS callback URL.");
  }
  return parsedUrl.toString();
}

async function paystackRequest(path, { method = "GET", body } = {}) {
  const secretKey = getPaystackSecretKey();
  const response = await fetch(`${paystackApiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Paystack returned an invalid response.");
  }

  if (!response.ok || payload?.status !== true || !payload.data) {
    throw new Error("Paystack could not complete the request.");
  }
  return payload.data;
}

export async function initializePaystackTransaction({ email, amount, reference, callbackUrl, metadata }) {
  const transaction = await paystackRequest("/transaction/initialize", {
    method: "POST",
    body: { email, amount, currency: "GHS", reference, callback_url: callbackUrl, metadata },
  });

  if (typeof transaction.access_code !== "string" || !transaction.access_code || transaction.access_code.length > 512
    || typeof transaction.reference !== "string" || !transaction.reference) {
    throw new Error("Paystack returned invalid transaction details.");
  }

  return { accessCode: transaction.access_code, reference: transaction.reference };
}

export async function verifyPaystackTransaction(reference) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function isValidPaystackWebhookSignature(rawBody, signature, secretKey) {
  if (typeof signature !== "string" || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
