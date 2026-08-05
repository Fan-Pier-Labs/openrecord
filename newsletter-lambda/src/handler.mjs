// AWS Lambda handler (Function URL, payload format v2) for newsletter/waitlist
// signups from the OpenRecord login page. Zero dependencies on purpose: it just
// validates the payload and console.log()s it as structured JSON, which Lambda
// writes to the CloudWatch log group /aws/lambda/<function-name>. Read signups
// later with CloudWatch Logs Insights (see README.md).

const MAX_NAME = 200;
const MAX_EMAIL = 320; // RFC 5321 max email length
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(statusCode, body) {
  // CORS headers are added by the Function URL's CORS config; we only return the
  // body. (The Function URL also auto-handles OPTIONS preflight.)
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method;
  // CORS preflight. API Gateway adds the Access-Control-* headers from its CORS
  // config; we just need to answer with a 2xx so the browser proceeds. (The
  // quick-create $default route forwards OPTIONS here instead of letting the
  // gateway short-circuit it.)
  if (method === "OPTIONS") {
    return { statusCode: 204 };
  }
  if (method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let payload;
  try {
    const raw = event?.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : event?.body;
    payload = JSON.parse(raw || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  // Honeypot: real users never fill this hidden field. Bots do. Accept silently
  // so the bot thinks it succeeded, but never log it.
  if (payload?.company) {
    return json(200, { ok: true });
  }

  const name = String(payload?.name ?? "").trim().slice(0, MAX_NAME);
  const email = String(payload?.email ?? "").trim().slice(0, MAX_EMAIL);

  if (!email || !EMAIL_RE.test(email)) {
    return json(400, { error: "Valid email required" });
  }

  console.log(
    JSON.stringify({
      type: "newsletter_signup",
      name,
      email,
      ts: new Date().toISOString(),
      ip: event?.requestContext?.http?.sourceIp,
      ua: event?.headers?.["user-agent"],
    }),
  );

  return json(200, { ok: true });
};
