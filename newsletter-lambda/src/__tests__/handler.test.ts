import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { handler } from "../handler.mjs";

type LambdaEvent = {
  requestContext?: { http?: { method?: string; sourceIp?: string } };
  headers?: Record<string, string>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

function postEvent(body: string | null, opts: Partial<LambdaEvent> = {}): LambdaEvent {
  return {
    requestContext: { http: { method: "POST", sourceIp: "203.0.113.1" } },
    headers: { "user-agent": "test-agent" },
    body,
    isBase64Encoded: false,
    ...opts,
  };
}

let logSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  logSpy = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("newsletter handler", () => {
  it("accepts a valid POST and logs the signup", async () => {
    const res = await handler(postEvent(JSON.stringify({ name: "Test User", email: "test@example.com" })));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.type).toBe("newsletter_signup");
    expect(logged.email).toBe("test@example.com");
    expect(logged.name).toBe("Test User");
  });

  it("answers CORS preflight (OPTIONS) with 204 and no body", async () => {
    const res = await handler({ requestContext: { http: { method: "OPTIONS" } } });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBeUndefined();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods", async () => {
    const res = await handler({ requestContext: { http: { method: "GET" } } });
    expect(res.statusCode).toBe(405);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const res = await handler(postEvent("{not json"));
    expect(res.statusCode).toBe(400);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing or invalid email", async () => {
    const missing = await handler(postEvent(JSON.stringify({ name: "No Email" })));
    expect(missing.statusCode).toBe(400);

    const bad = await handler(postEvent(JSON.stringify({ email: "not-an-email" })));
    expect(bad.statusCode).toBe(400);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("decodes a base64-encoded body", async () => {
    const raw = JSON.stringify({ name: "B64", email: "b64@example.com" });
    const res = await handler(
      postEvent(Buffer.from(raw, "utf8").toString("base64"), { isBase64Encoded: true }),
    );
    expect(res.statusCode).toBe(200);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.email).toBe("b64@example.com");
  });

  it("silently drops honeypot submissions without logging", async () => {
    const res = await handler(
      postEvent(JSON.stringify({ name: "Bot", email: "bot@example.com", company: "Spam Inc" })),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
