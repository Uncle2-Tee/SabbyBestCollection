const ARKESEL_URL = "https://sms.arkesel.com/api/otp";

const providerMessages = {
  "1001": "Arkesel rejected the OTP request. Check that the SMS sender ID and message settings are valid.",
  "1002": "Arkesel rejected the OTP message template. The message must include %otp_code%.",
  "1003": "Arkesel has blocked this sender ID. Register or contact Arkesel to approve it for OTP.",
  "1004": "Arkesel's SMS gateway is inactive or its account credentials are unavailable.",
  "1005": "Arkesel rejected the phone number. Enter a valid number with its country code.",
  "1006": "Arkesel does not currently allow OTP delivery to this country.",
  "1007": "The Arkesel account has insufficient balance for OTP messages.",
  "1008": "The Arkesel account has insufficient balance for OTP messages.",
  "1101": "Arkesel rejected the verification request. Check the code and phone number.",
  "1102": "Arkesel rejected the phone number. Enter a valid number with its country code.",
  "1103": "Arkesel rejected the phone number. Enter a valid number with its country code.",
};

function providerError(response, result, operation) {
  const code = String(result?.code ?? result?.status ?? "");
  const message = response.status === 401
    ? "Arkesel rejected the API key. Use the Main SMS API key; OTP does not support multiple or sub-keys."
    : providerMessages[code] || `Arkesel could not ${operation} the OTP. Check the SMS API key, sender ID, balance, and phone number.`;
  console.warn("Arkesel OTP request failed.", {
    operation,
    httpStatus: response.status,
    providerCode: code || "unavailable",
  });
  const error = new Error(message);
  error.userMessage = message;
  error.name = response.status >= 500 ? "ArkeselServiceError" : "ArkeselRequestError";
  return error;
}

export async function sendArkeselOtp(number) {
  const apiKey = process.env.ARKESEL_API_KEY;
  const senderId = process.env.ARKESEL_SENDER_ID;
  if (!apiKey || !senderId) throw new Error("Phone verification is not configured.");

  const response = await fetch(`${ARKESEL_URL}/generate`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      expiry: "5",
      length: "6",
      medium: "sms",
      message: "Your SabbyBestCollection verification code is %otp_code%. It expires in 5 minutes.",
      number,
      sender_id: senderId,
      type: "numeric",
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || String(result?.code) !== "1000") {
    throw providerError(response, result, "send");
  }
}

export async function verifyArkeselOtp(number, code) {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) throw new Error("Phone verification is not configured.");

  const response = await fetch(`${ARKESEL_URL}/verify`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ code, number }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status >= 500 || response.status === 429 || response.status === 401) {
    throw providerError(response, result, "verify");
  }
  if (!response.ok || String(result?.code) !== "1100") {
    return false;
  }
  return true;
}
