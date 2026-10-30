import { publishCustomerSession, subscribeToCustomerSession } from "./customer-session";

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "The request could not be completed.");
    error.status = response.status;
    error.existingAccount = result.existingAccount === true;
    throw error;
  }
  return result;
}

export async function getCustomerSession() {
  const { session } = await request("/api/auth/session");
  return session;
}

export async function startCustomerVerification(identifier) {
  return request("/api/auth/verification", {
    method: "POST",
    body: { identifier },
  });
}

export async function verifyCustomerContact(identifier, code) {
  return request("/api/auth/verification", {
    method: "PATCH",
    body: { identifier, code },
  });
}

export async function signUpCustomer({ identifier, password }) {
  return request("/api/auth/signup", {
    method: "POST",
    body: { identifier, password },
  });
}

export async function requestCustomerPasswordReset(email) {
  return request("/api/auth/password-reset", {
    method: "POST",
    body: { email },
  });
}

export async function resetCustomerPassword({ email, code, password }) {
  return request("/api/auth/password-reset", {
    method: "PATCH",
    body: { email, code, password },
  });
}

export async function signInCustomer({ identifier, password, code }) {
  const result = await request("/api/auth/signin", {
    method: "POST",
    body: code === undefined ? { identifier, password } : { identifier, code },
  });
  if (result.session) publishCustomerSession(result.session);
  return result;
}

export async function signOutCustomer() {
  await request("/api/auth/signout", { method: "POST" });
  publishCustomerSession(null);
}

export function listenForCustomerSessionChanges(listener) {
  return subscribeToCustomerSession(listener);
}
